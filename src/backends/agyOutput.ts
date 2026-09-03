import { spawn } from "child_process";
import { CLI, ENV } from "../constants.js";
import { resolveCommandForExecution } from "../utils/commandExecutor.js";
import { extractReplies, type TranscriptEntry } from "./agyTranscript.js";

/**
 * Interprets `agy`'s *output channels* (as opposed to agyTranscript.ts, which
 * reads its on-disk files). Two Phase 3 paths live here, both aimed at getting a
 * real answer off stdout so the transcript scrape can retire:
 *   1. parseAgyJsonResponse — read `agy --output-format json` cleanly.
 *   2. runAgyUnderPty — coax a TTY-only build into actually printing, via a
 *      pseudo-terminal, without touching any private files (S1b).
 */

export interface ParseAgyJsonOptions {
  preferStructured?: boolean;
  includeUsage?: boolean;
}

/**
 * Best-effort extraction of the model reply from `agy --output-format json`
 * stdout. Supports plain text replies, transcript entry streams, and
 * structured output objects (--json-schema).
 */
export function parseAgyJsonResponse(
  stdout: string,
  options?: ParseAgyJsonOptions,
): string | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;

  const candidates: unknown[] = [];
  try {
    candidates.push(JSON.parse(trimmed)); // single object / array
  } catch {
    for (const line of trimmed.split(/\r?\n/)) {
      const l = line.trim();
      if (!l) continue;
      try {
        candidates.push(JSON.parse(l)); // JSONL / stream-json
      } catch {
        /* not a JSON line */
      }
    }
  }
  if (!candidates.length) return undefined;

  // Flatten one level so a top-level array of entries is handled too.
  const flat = candidates.flatMap((c) => (Array.isArray(c) ? c : [c]));

  // 1) Check for structured output first if requested or present
  for (const c of flat) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (o.structured_output !== undefined && o.structured_output !== null) {
      const jsonStr = typeof o.structured_output === "string"
        ? o.structured_output
        : JSON.stringify(o.structured_output, null, 2);
      if (options?.preferStructured) return jsonStr;
    }
  }

  // 2) Transcript-entry stream → reuse the one canonical extractor.
  const entries = flat.filter(
    (c): c is TranscriptEntry => !!c && typeof c === "object",
  );
  const fromEntries = extractReplies(entries);
  if (fromEntries) return fromEntries;

  // 3) A result object carrying the reply under a conventional field name.
  const texts: string[] = [];
  let usageSummary: string | undefined;

  for (const c of flat) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    
    // Capture usage if available and requested
    if (options?.includeUsage && o.usage && typeof o.usage === "object") {
      const u = o.usage as Record<string, number>;
      const inTok = u.input_tokens ?? 0;
      const outTok = u.output_tokens ?? 0;
      const thinkTok = u.thinking_tokens ? ` (${u.thinking_tokens} thinking)` : "";
      const dur = typeof o.duration_seconds === "number" ? ` | ${o.duration_seconds.toFixed(1)}s` : "";
      usageSummary = `\n\n📊 [Tokens: ${inTok.toLocaleString()} in, ${outTok.toLocaleString()} out${thinkTok}${dur}]`;
    }

    // Check structured_output as fallback text if response is missing
    if (o.structured_output !== undefined && o.structured_output !== null && !texts.length) {
      const jsonStr = typeof o.structured_output === "string"
        ? o.structured_output
        : JSON.stringify(o.structured_output, null, 2);
      texts.push(jsonStr);
      break;
    }

    for (const k of ["response", "text", "content", "message", "output", "result"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) {
        texts.push(v.trim());
        break;
      }
    }
  }
  let joined = texts.join("\n\n").trim();
  if (joined && usageSummary) {
    joined += usageSummary;
  }
  return joined || undefined;
}

/** POSIX single-quote a token so it is inert inside an `sh -c` command string. */
export function shSingleQuote(token: string): string {
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/** Remove the `script(1)` banner lines and CRs so we keep only the child output. */
export function stripScriptNoise(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !/^Script (started|done)/.test(line))
    .join("\n")
    .trim();
}

/** Whether the opt-in PTY recovery path is enabled (AGY_MCP_PTY=1). */
export function ptyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env[ENV.AGY_PTY] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const PTY_TIMEOUT_MS = 10 * 60 * 1000; // generous: large analyses can be slow

/**
 * Run `agy <args>` under a pseudo-terminal via the `script(1)` utility, so a build
 * that only streams output to a TTY still gives us real stdout — recovering the
 * answer without reading any of agy's private transcript files (Phase 3, S1b).
 *
 * Opt-in (AGY_MCP_PTY=1), POSIX-only, and best-effort: resolves to "" if `script`
 * is missing or yields nothing, so the caller falls through to transcript
 * recovery. The agy path and every arg are POSIX-quoted, preserving the
 * shell-injection safety of the non-PTY path.
 */
export function runAgyUnderPty(
  args: string[],
  onProgress?: (newOutput: string) => void,
): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      resolve(""); // no `script` PTY on Windows
      return;
    }
    const agy = resolveCommandForExecution(CLI.COMMANDS.AGY);
    const inner = [agy, ...args].map(shSingleQuote).join(" ");
    // util-linux: `script -qec CMD FILE`; BSD/macOS: `script -q FILE CMD...`.
    const scriptArgs =
      process.platform === "darwin"
        ? ["-q", "/dev/null", "/bin/sh", "-c", inner]
        : ["-qec", inner, "/dev/null"];

    let child;
    try {
      child = spawn("script", scriptArgs, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true, // own process group, so the timeout can kill sh + agy too
      });
    } catch {
      resolve(""); // `script` not installed
      return;
    }

    let out = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(stripScriptNoise(out));
    };
    child.stdout?.on("data", (d) => {
      const s = d.toString();
      out += s;
      onProgress?.(s);
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(""); // spawn failed → let the caller fall back
    });
    child.on("close", () => finish());

    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL"); // -pid = whole group
      } catch {
        /* already gone */
      }
      finish();
    }, PTY_TIMEOUT_MS);
    timer.unref?.();
  });
}
