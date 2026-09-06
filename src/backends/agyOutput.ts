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

  // Usage is collected up front, before the early return: a transcript-shaped
  // reply used to lose the token line that a plain reply got, because that branch
  // returned before this loop ran.
  let usageSummary: string | undefined;
  if (options?.includeUsage) {
    for (const c of flat) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      if (!o.usage || typeof o.usage !== "object") continue;
      const u = o.usage as Record<string, number>;
      const inTok = u.input_tokens ?? 0;
      const outTok = u.output_tokens ?? 0;
      const thinkTok = u.thinking_tokens ? ` (${u.thinking_tokens} thinking)` : "";
      const dur = typeof o.duration_seconds === "number" ? ` | ${o.duration_seconds.toFixed(1)}s` : "";
      usageSummary = `\n\n📊 [Tokens: ${inTok.toLocaleString()} in, ${outTok.toLocaleString()} out${thinkTok}${dur}]`;
    }
  }
  const withUsage = (reply: string) => (usageSummary ? reply + usageSummary : reply);

  // 1) Check for structured output first if requested or present
  for (const c of flat) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (o.structured_output !== undefined && o.structured_output !== null) {
      const jsonStr = typeof o.structured_output === "string"
        ? o.structured_output
        : JSON.stringify(o.structured_output, null, 2);
      // Never withUsage() here: a --json-schema body is what the caller runs
      // JSON.parse on, and a trailing "📊 [Tokens: …]" line makes it unparseable.
      if (options?.preferStructured) return jsonStr;
    }
  }

  // 2) Transcript-entry stream → reuse the one canonical extractor.
  const entries = flat.filter(
    (c): c is TranscriptEntry => !!c && typeof c === "object",
  );
  const fromEntries = extractReplies(entries);
  if (fromEntries) return withUsage(fromEntries);

  // 3) A result object carrying the reply under a conventional field name.
  const texts: string[] = [];

  for (const c of flat) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;

    let found = false;
    for (const k of ["response", "text", "content", "message", "output", "result"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) {
        texts.push(v.trim());
        found = true;
        break;
      }
    }

    // structured_output only stands in for a missing reply: a resumed
    // conversation carries the schema result of an earlier turn alongside the
    // new reply, and that stale object must not win over the answer.
    if (!found && !texts.length && o.structured_output !== undefined && o.structured_output !== null) {
      texts.push(
        typeof o.structured_output === "string"
          ? o.structured_output
          : JSON.stringify(o.structured_output, null, 2),
      );
    }
  }
  const joined = texts.join("\n\n").trim();
  return joined ? withUsage(joined) : undefined;
}

/**
 * The one NDJSON line `agy --input-format stream-json` accepts on stdin. Sending
 * the prompt this way sidesteps the OS argv cap (32,767 chars on Windows,
 * 128 KB per argument on Linux) that a `-p <prompt>` with inlined @files hits.
 */
export function streamJsonUserMessage(prompt: string): string {
  return JSON.stringify({ event: "user", message: { role: "user", content: prompt } }) + "\n";
}

/**
 * agy's result object: the whole stdout under `--output-format json`, or the
 * final `{"event":"result","result":{...}}` line under `stream-json`.
 */
export function agyResult(stdout: string, stream: boolean): Record<string, unknown> | undefined {
  const asObject = (raw: string): Record<string, unknown> | undefined => {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };
  if (!stream) return asObject(stdout.trim());
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const o = asObject(lines[i].trim());
    if (o?.event === "result" && o.result && typeof o.result === "object") {
      return o.result as Record<string, unknown>;
    }
  }
  return undefined;
}

/** agy's own verdict on a failed run (`"error"` in the result), verbatim. */
export function agyErrorText(result?: Record<string, unknown>): string | undefined {
  const e = result?.error;
  return typeof e === "string" && e.trim() ? e.trim() : undefined;
}

/** The conversation the run belongs to, so the caller can continue the thread. */
export function agyConversationId(result?: Record<string, unknown>): string | undefined {
  const id = result?.conversation_id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

/**
 * What a *successful* result still needs to say out loud: a `status` other than
 * SUCCESS, and the `denied_actions` a headless run collected. Observed live as
 * `denied_actions":[{"display_name":"AskQuestion"}]` — a tool call the runtime
 * refused with nobody around to approve it. A refused write in accept-edits mode
 * arrives the same way, so without this the edit just silently never happened.
 */
export function agyResultNotices(result?: Record<string, unknown>): string[] {
  const notices: string[] = [];
  const status = typeof result?.status === "string" ? result.status.trim() : "";
  if (status && status.toUpperCase() !== "SUCCESS") {
    notices.push(`agy reported status "${status}" for this run.`);
  }
  const denied = result?.denied_actions;
  if (Array.isArray(denied) && denied.length) {
    const names = denied.map((d) => {
      const name = d && typeof d === "object" ? (d as Record<string, unknown>).display_name : undefined;
      return typeof name === "string" && name.trim() ? name.trim() : "unnamed action";
    });
    notices.push(
      `agy refused ${names.length} tool action(s) in this headless run (nobody could approve them): ${names.join(", ")}.`,
    );
  }
  return notices;
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
