import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { backendSelection } from '../backends/index.js';
import { CLI, ENV, RETIREMENT } from '../constants.js';
import { resolveCommandForExecution, executeCommand } from '../utils/commandExecutor.js';

const geminiDoctorArgsSchema = z.object({});

// A doctor run must never hang or throw: every probe here is bounded and caught.
const PROBE_TIMEOUT_MS = 5_000;
const USAGE_TIMEOUT_MS = 10_000;

interface ProbeResult { found: boolean; path: string; version: string }
/** `ok` means "this check came back healthy", never merely "the process exited 0". */
export interface UsageResult { ok: boolean; report: string }

async function probeCli(command: string): Promise<ProbeResult> {
  const resolved = resolveCommandForExecution(command);
  try {
    const out = await executeCommand(command, ["--version"], undefined, undefined, PROBE_TIMEOUT_MS);
    return { found: true, path: resolved, version: out.split(/\r?\n/)[0].trim() };
  } catch {
    return { found: false, path: resolved, version: "" };
  }
}

/**
 * Render the payload of `agy -p "/usage" --output-format json`. Verified on agy
 * 1.1.27: `{ status: "SUCCESS", command: { name: "usage", data: { groups: [{
 * name, description, buckets: [{ id, name, window, remaining_fraction,
 * reset_time }] }] } } }`.
 *
 * `ok` is decided by the payload, not by the exit code: agy exits 0 while out of
 * quota, and it exits 0 with unparseable stdout when it prefixes an update
 * notice (observed live during a 1.1.25 → 1.1.27 self-update). Reporting
 * "System Ready" over either is exactly the failure audit bug 12 named.
 */
export function formatUsageReport(raw: string): UsageResult {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, report: "- ⚠️ `/usage` returned output this tool could not parse, so the account could not be verified." };
  }
  if (payload?.status && payload.status !== "SUCCESS") {
    return { ok: false, report: `- ❌ \`/usage\` reported status \`${payload.status}\` — most likely signed out. Run \`agy\` once interactively to sign in.` };
  }
  const groups = payload?.command?.data?.groups;
  if (!Array.isArray(groups)) {
    return { ok: false, report: "- ⚠️ `/usage` returned no quota groups, so the account could not be verified." };
  }
  const lines: string[] = [];
  let anyRemaining = false;
  for (const group of groups as any[]) {
    for (const bucket of Array.isArray(group?.buckets) ? group.buckets : []) {
      const fraction = bucket?.remaining_fraction;
      const known = typeof fraction === "number";
      // An unreadable fraction is not evidence of exhaustion, only of a shape change.
      if (!known || fraction > 0) anyRemaining = true;
      const remaining = known ? `${Math.round(fraction * 100)}%` : "unknown";
      const window = bucket?.name || bucket?.window || "quota";
      lines.push(`- \`${group?.name ?? "?"}\` — ${window}: **${remaining} left**, resets \`${bucket?.reset_time ?? "unknown"}\``);
    }
  }
  if (!lines.length) {
    return { ok: false, report: "- ⚠️ `/usage` returned no quota buckets, so the account could not be verified." };
  }
  if (!anyRemaining) {
    return { ok: false, report: `${lines.join("\n")}\n- ❌ Every quota bucket is exhausted — model calls will fail until one resets.` };
  }
  return { ok: true, report: lines.join("\n") };
}

/**
 * Login + quota check. `/usage` is answered by agy's command layer without
 * starting an agent turn: zero tokens, no conversation left behind, and a
 * non-zero exit when the account is signed out or unreachable — which is the
 * most common real failure a doctor run should catch (audit bug 12).
 */
async function probeUsage(): Promise<UsageResult> {
  try {
    const raw = await executeCommand(
      CLI.COMMANDS.AGY,
      [CLI.FLAGS.PROMPT, "/usage", CLI.FLAGS.OUTPUT_FORMAT, "json"],
      undefined,
      undefined,
      USAGE_TIMEOUT_MS,
    );
    return formatUsageReport(raw);
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0].slice(0, 300);
    return {
      ok: false,
      report: `- ❌ Login check failed — most likely signed out, offline, or out of quota. Run \`agy\` once interactively to sign in.\n- Detail: \`${detail}\``,
    };
  }
}

export interface DoctorFacts {
  backend: {
    name: string;
    supportsModelSelection?: boolean;
    supportsReasoningEffort?: boolean;
    supportsStructuredOutput?: boolean;
  };
  backendSource: string;
  agy: ProbeResult;
  gemini: ProbeResult;
  usage: UsageResult;
}

/**
 * Render the diagnostic. Pure, so every verdict branch is testable without
 * spawning a CLI or reaching Google.
 */
export function formatDoctorReport(f: DoctorFacts): string {
  const agyFlag = (supported: boolean | undefined) =>
    f.backend.name === 'agy' ? (supported ? "✅ Yes" : "❌ No") : "N/A";

  // The verdict must describe the backend that actually serves calls. With
  // GEMINI_CLI_BACKEND=gemini (the enterprise / paid-key path) agy's account
  // state is irrelevant, so it must not turn a working install into a failure.
  const verdict = f.backend.name !== 'agy'
    ? (f.gemini.found
      ? `🎉 **System Ready!** The \`${f.backend.name}\` backend is active.`
      : `⚠️ **Action needed:** the \`${f.backend.name}\` backend is selected but its CLI was not found.`)
    : !f.agy.found
      ? "⚠️ **Action needed:** Install Antigravity CLI: `" + RETIREMENT.AGY_INSTALL_CMD + "`"
      : f.usage.ok
        ? "🎉 **System Ready!** The modern Antigravity CLI backend is active, signed in, and operational."
        : "⚠️ **Action needed:** `agy` is installed, but its account check did not come back healthy — see **Login & Quota** above.";

  return `### Gemini MCP Tool Doctor & Environment Diagnostic

**Runtime Environment:**
- Node.js: \`${process.version}\`
- OS: \`${process.platform} (${process.arch})\`
- Active Backend: **\`${f.backend.name.toUpperCase()}\`** (via \`${f.backendSource}\`)

**Antigravity CLI (\`agy\`) - Modern Default:**
- Status: ${f.agy.found ? `✅ Installed (\`${f.agy.version}\`)` : "❌ Not found"}
- Executable: \`${f.agy.path || 'not resolved'}\`
- Model Selection: ${agyFlag(f.backend.supportsModelSelection)}
- Reasoning Effort: ${agyFlag(f.backend.supportsReasoningEffort)}
- Structured Output: ${agyFlag(f.backend.supportsStructuredOutput)}

**Gemini CLI (\`gemini\`) - Legacy Backend:**
- Status: ${f.gemini.found ? `✅ Installed (\`${f.gemini.version}\`)` : "⚠️ Not installed (retired on " + RETIREMENT.GEMINI_CLI_ISO + ")"}
- Executable: \`${f.gemini.path || 'not resolved'}\`

**Login & Quota** (\`agy -p "/usage"\` — answered without an agent turn, costs no tokens):
${f.usage.report}

${verdict}`;
}

export const geminiDoctorTool: UnifiedTool = {
  name: "gemini-doctor",
  description: "Diagnose and verify Gemini CLI / Antigravity CLI (agy) installation, active backend, CLI version, and system readiness.",
  zodSchema: geminiDoctorArgsSchema,
  prompt: {
    description: "Run diagnostic checks on Gemini CLI / Antigravity CLI environment and report status.",
  },
  category: 'simple',
  execute: async (_args, _onProgress) => {
    const { backend } = backendSelection();

    const agy = await probeCli(CLI.COMMANDS.AGY);
    const gemini = await probeCli(CLI.COMMANDS.GEMINI);
    // Only ask agy about its account when agy is the backend serving calls, and
    // only when the binary exists: no point spending a network round trip on a
    // missing binary or on a backend this install is not using.
    const usage: UsageResult = backend.name !== 'agy'
      ? { ok: false, report: `- ℹ️ Skipped: the \`${backend.name}\` backend is active, so agy's account state does not affect this install.` }
      : agy.found
        ? await probeUsage()
        : { ok: false, report: "- ⚠️ Skipped: `agy` was not found, so login and quota could not be checked." };

    return formatDoctorReport({
      backend,
      backendSource: process.env[ENV.BACKEND] ? ENV.BACKEND : 'auto-default',
      agy,
      gemini,
      usage,
    });
  },
};
