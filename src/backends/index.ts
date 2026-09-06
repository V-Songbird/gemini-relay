import { ENV, MODELS, RETIREMENT } from "../constants.js";
import { Logger } from "../utils/logger.js";
import type { Backend, BackendRunOptions } from "./types.js";
import { geminiBackend } from "./gemini.js";
import { agyBackend } from "./agy.js";

export type { Backend, BackendRunOptions } from "./types.js";
export { geminiBackend } from "./gemini.js";
export { agyBackend } from "./agy.js";

/** Pre-retirement default backend name. */
export const DEFAULT_BACKEND = "gemini";

const RETIREMENT_MS = Date.parse(`${RETIREMENT.GEMINI_CLI_ISO}T00:00:00Z`);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The default backend, resolved against the calendar (Phase 4 cutover): the
 * Gemini CLI until it is retired on 2026-06-18, then `agy` automatically — because
 * once gemini is gone, agy is the only live option. An explicit GEMINI_MCP_BACKEND
 * always overrides this. `now` is injectable for tests.
 */
export function resolveDefaultBackend(now: Date = new Date()): "gemini" | "agy" {
  return now.getTime() >= RETIREMENT_MS ? "agy" : "gemini";
}

/**
 * Select the active backend. GEMINI_MCP_BACKEND wins ("agy"/"antigravity" →
 * Antigravity CLI, "gemini" → Gemini CLI); otherwise the date-aware default.
 */
export function getBackend(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Backend {
  const explicit = (env[ENV.BACKEND] || "").trim().toLowerCase();
  const name = explicit || resolveDefaultBackend(now);
  switch (name) {
    case "agy":
    case "antigravity":
      return agyBackend;
    case "gemini":
      return geminiBackend;
    default:
      Logger.warn(`Unknown ${ENV.BACKEND}="${name}", falling back to gemini.`);
      return geminiBackend;
  }
}

// A retirement notice is shown once per process, not on every call: the
// post-retirement one used to be unguarded, so it prefixed every single reply
// from every tool for as long as the server ran. "Once" is counted at *delivery*
// (withNotices), not here, because ping/Help (simple-tools) and gemini-doctor
// call backendSelection for the backend name alone and drop the notices — marking
// it produced would burn the single shot before any caller ever saw it.
let retirementNoticeShown = false;
let pendingRetirementNotice: string | undefined;

/**
 * Resolve the backend and any migration notices to surface to the caller:
 *  - post-retirement, when the default has auto-flipped to agy;
 *  - in the final countdown, a one-time nudge to test agy early.
 * Each fires at most once per process, and both are suppressed when
 * GEMINI_MCP_BACKEND is set explicitly.
 */
export function backendSelection(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): { backend: Backend; notices: string[] } {
  const backend = getBackend(env, now);
  const notices: string[] = [];
  const explicit = (env[ENV.BACKEND] || "").trim();

  if (!explicit && !retirementNoticeShown) {
    const daysLeft = Math.ceil((RETIREMENT_MS - now.getTime()) / DAY_MS);
    const notice =
      backend.name === "agy"
        ? `Gemini CLI was retired on ${RETIREMENT.GEMINI_CLI_ISO}; defaulting to the Antigravity CLI (agy) backend. Set ${ENV.BACKEND}=gemini to override.`
        : daysLeft <= RETIREMENT.WARN_WITHIN_DAYS
          ? `Gemini CLI retires on ${RETIREMENT.GEMINI_CLI_ISO} (~${daysLeft} day(s) left); test the successor now with ${ENV.BACKEND}=agy.`
          : undefined;
    if (notice) {
      pendingRetirementNotice = notice;
      notices.push(notice);
    }
  }
  return { backend, notices };
}

/** Test seam: reset both once-per-process retirement notices. */
export function __resetRetirementNudgeForTest(): void {
  retirementNoticeShown = false;
  pendingRetirementNotice = undefined;
}

/**
 * Run a prompt through the active backend, applying capability gating so the
 * caller never gets a silent behaviour change:
 *  - if the backend can't honour `model`, the model is dropped and a notice
 *    explains it (agy print-mode is Flash-only);
 *  - if the backend can't isolate tool execution, a requested `sandbox` yields a
 *    notice rather than a false sense of safety.
 * Notices are returned alongside the text for the tool layer to surface, as is
 * the conversation id the backend observed (undefined when it reports none), so
 * a caller can resume the thread without reading agy's private cache files.
 */
export async function runWithBackend(
  prompt: string,
  opts: BackendRunOptions,
): Promise<{ text: string; notices: string[]; backend: string; conversationId?: string }> {
  const { backend, notices } = backendSelection();
  let conversationId: string | undefined;
  const effective: BackendRunOptions = {
    ...opts,
    onNotice: (m) => notices.push(m),
    onConversationId: (id) => (conversationId = id),
  };

  if (effective.model && !backend.supportsModelSelection) {
    notices.push(
      `Backend "${backend.name}" ignores model selection (print-mode is ${MODELS.AGY_PRINT_DEFAULT}-only); "${effective.model}" was not applied.`,
    );
    effective.model = undefined; // and skip the gemini-only quota fallback path
  }
  if (effective.effort && backend.supportsReasoningEffort === false) {
    notices.push(
      `Backend "${backend.name}" does not support reasoning effort configuration; "${effective.effort}" was ignored.`,
    );
    effective.effort = undefined;
  }
  if (effective.mode && backend.supportsModes === false) {
    notices.push(
      `Backend "${backend.name}" does not support execution mode "${effective.mode}".`,
    );
    effective.mode = undefined;
  }
  if (effective.jsonSchema && backend.supportsStructuredOutput === false) {
    notices.push(
      `Backend "${backend.name}" does not support JSON schema enforcement.`,
    );
  }
  if (effective.sandbox && !backend.sandboxIsolatesToolExecution) {
    notices.push(
      `Backend "${backend.name}" does not isolate tool execution in headless mode; the sandbox request cannot be guaranteed.`,
    );
  }

  const text = await backend.run(prompt, effective);
  return { text, notices, backend: backend.name, conversationId };
}

/** Prepend any capability notices to a response so changes are never silent. */
export function withNotices(notices: string[], body: string): string {
  if (!notices.length) return body;
  // This is the moment a notice actually reaches a caller, so it is where the
  // one-shot migration notice is spent (see backendSelection).
  if (pendingRetirementNotice && notices.includes(pendingRetirementNotice)) {
    retirementNoticeShown = true;
    pendingRetirementNotice = undefined;
  }
  return notices.map((n) => `⚠️ ${n}`).join("\n") + "\n\n" + body;
}
