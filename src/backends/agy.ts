import { Logger } from "../utils/logger.js";
import { CLI, APPROVAL_MODES, ENV, MODELS } from "../constants.js";
import { executeCommand, COMMAND_TIMEOUT_MS, type CommandError } from "../utils/commandExecutor.js";
import {
  inlineFileReferences,
  prepareChangeModePrompt,
} from "../utils/geminiExecutor.js";
import {
  conversationIdForCwd,
  conversationFreshSince,
  newestConversationSince,
  readTranscriptResponse,
} from "./agyTranscript.js";
import { probeAgyCapabilities, type AgyCapabilities } from "./agyCapabilities.js";
import {
  agyConversationId,
  agyErrorText,
  agyResult,
  agyResultNotices,
  parseAgyJsonResponse,
  ptyEnabled,
  runAgyUnderPty,
  streamJsonUserMessage,
  type ParseAgyJsonOptions,
} from "./agyOutput.js";
import type { Backend, BackendRunOptions, ModelInfo } from "./types.js";

/**
 * Modern Antigravity CLI (`agy`) backend — default backend for Gemini.
 *
 * Provides deep integration with Gemini 3.8 Flash and Gemini 3.1 Pro via `agy`:
 *  1. Direct stdout & structured JSON: Modern `agy` emits clean JSON stdout
 *     via `--output-format json`/`stream-json`, including token usage and
 *     structured outputs; the prompt itself travels on stdin (stream-json).
 *  2. Model selection: Full model support across Gemini 3.8 Flash (high/medium/low),
 *     Gemini 3.7 Flash, Gemini 3.1 Pro (high/low), and aliases.
 *  3. Reasoning effort: Direct control over thinking tokens via `--effort` (low/medium/high).
 *  4. Structured outputs: Enforces valid JSON via `--json-schema`.
 *  5. Agent modes: Plan mode (`--mode plan`) for architecture and read-only analysis.
 *  6. Safe file reference handling & project root guards.
 */

/** Normalize model names and aliases to canonical Gemini CLI model identifiers. */
export function normalizeAgyModel(model?: string): string {
  if (!model) return MODELS.DEFAULT;
  const m = model.trim().toLowerCase();
  if (
    m === "flash" ||
    m === "gemini-flash" ||
    m === "gemini-3.8-flash" ||
    m === "gemini-2.5-flash" ||
    m === "gemini-3.5-flash"
  ) {
    return MODELS.GEMINI_3_8_FLASH_HIGH;
  }
  if (
    m === "pro" ||
    m === "gemini-pro" ||
    m === "gemini-3.1-pro" ||
    m === "gemini-2.5-pro"
  ) {
    return MODELS.GEMINI_3_1_PRO_HIGH;
  }
  return model.trim();
}

/** Build the prompt agy actually receives: changeMode wrap + self-inlined files. */
export function buildAgyPrompt(prompt: string, opts: BackendRunOptions): string {
  // Shared changeMode preprocessing with the gemini backend, so the two
  // backends produce the same prompt body for the same request.
  const processed = opts.changeMode ? prepareChangeModePrompt(prompt) : prompt;
  // agy doesn't inline @file; do it ourselves (keeps the CVE-2026-0755 guard).
  return inlineFileReferences(processed);
}

/**
 * One rule for every flag: send it only when the installed agy advertises it in
 * `--help`. An unknown flag makes agy exit non-zero and fail the whole run, so a
 * flag we are not sure about is worth less than the request it would break — and
 * an unadvertised flag would have been ignored anyway. `caps` is required rather
 * than optional so no caller can accidentally opt out of the probe.
 */
export function buildAgyArgs(opts: BackendRunOptions, caps: AgyCapabilities): string[] {
  const args: string[] = [];

  // Model selection (supported in modern agy print mode)
  if (opts.model && caps.modelFlag) {
    args.push(CLI.FLAGS.MODEL_LONG, normalizeAgyModel(opts.model));
  }

  // Reasoning effort: low | medium | high
  if (opts.effort && caps.effortFlag) {
    args.push(CLI.FLAGS.EFFORT, opts.effort);
  }

  // Structured output schema
  if (opts.jsonSchema && caps.jsonSchemaFlag) {
    const schemaStr =
      typeof opts.jsonSchema === "string"
        ? opts.jsonSchema
        : JSON.stringify(opts.jsonSchema);
    args.push(CLI.FLAGS.JSON_SCHEMA, schemaStr);
  }

  // Execution mode: accept-edits | plan
  if (opts.mode && caps.modeFlag) {
    args.push(CLI.FLAGS.MODE, opts.mode);
  }

  // Additional directories for workspace visibility
  if (opts.addDirs && Array.isArray(opts.addDirs) && caps.addDirFlag) {
    for (const dir of opts.addDirs) {
      if (dir && typeof dir === "string") {
        args.push(CLI.FLAGS.ADD_DIR, dir);
      }
    }
  }

  // Custom agent defined in an agent.md.
  if (opts.agent && caps.agentFlag) {
    args.push(CLI.FLAGS.AGENT, opts.agent);
  }

  // A prompt whose text starts with "/" is expanded by agy as a command or skill
  // instead of reaching the model — "/usage" answered with quota tables. Off
  // unless the caller wants those (free, zero-token) commands deliberately.
  if (!opts.allowSlashCommands && caps.disableSlashCommands) {
    args.push(CLI.FLAGS.DISABLE_SLASH_COMMANDS);
  }

  // Sessions: --conversation <id> resumes a specific conversation.
  if (opts.conversationId && caps.conversationId) {
    args.push(CLI.FLAGS.CONVERSATION, opts.conversationId);
  }

  // Forwarded, but see the sandbox notice — we never claim it isolates -p.
  if (opts.sandbox && caps.sandboxFlag) args.push("--sandbox");

  // agy has no graded approval modes; only "skip all prompts" maps cleanly.
  if (opts.approvalMode === APPROVAL_MODES.YOLO && caps.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  return args;
}

/**
 * Track agy's --print-timeout (default 5m) to our cap. Override: AGY_PRINT_TIMEOUT.
 *
 * It must stay *strictly* under the wrapper's SIGKILL deadline, or the wrapper
 * kills agy before agy can report its own timeout with a usable message: the old
 * `max(60, total - 60)` gave exactly 60s against a 60s kill at GEMINI_MCP_TIMEOUT=1.
 * Below 120s there is no room to reserve a whole minute, so we halve instead.
 */
export function agyPrintTimeoutArg(wrapperTimeoutMs: number = COMMAND_TIMEOUT_MS): string {
  const override = process.env[ENV.AGY_PRINT_TIMEOUT]?.trim();
  if (override) return override;
  const total = Math.floor(wrapperTimeoutMs / 1000);
  const seconds = total > 120 ? total - 60 : Math.max(1, Math.floor(total / 2));
  return `${seconds}s`;
}

/** A prompt the caller wants agy's own command layer to answer, not the model. */
export function isSlashCommand(prompt: string, opts: BackendRunOptions): boolean {
  return !!opts.allowSlashCommands && prompt.trimStart().startsWith("/");
}

/** One raw output channel → the reply, honouring JSON mode; undefined if empty. */
function replyFrom(
  raw: string,
  jsonMode: boolean,
  parseOpts?: ParseAgyJsonOptions,
): string | undefined {
  return jsonMode ? parseAgyJsonResponse(raw, parseOpts) : raw.trim() || undefined;
}

// Serialize agy calls: each run rewrites last_conversations.json, so concurrent
// runs would read each other's conversation ids back.
let agyQueue: Promise<unknown> = Promise.resolve();

export const agyBackend: Backend = {
  name: "agy",
  supportsModelSelection: true,
  supportsReasoningEffort: true,
  supportsStructuredOutput: true,
  supportsModes: true,
  sandboxIsolatesToolExecution: false, // -p runs tools with user privileges

  async listModels(): Promise<ModelInfo[]> {
    try {
      const stdout = await executeCommand(CLI.COMMANDS.AGY, ["--output-format", "json", "models"]);
      const parsed = JSON.parse(stdout);
      const list = parsed?.command?.data?.models;
      if (Array.isArray(list) && list.length > 0) {
        return list.map((m: any) => ({
          id: String(m.id || ""),
          label: String(m.label || m.id || ""),
        }));
      }
    } catch (e) {
      Logger.warn(`agy listModels failed, using fallback: ${(e as Error).message}`);
    }
    return [
      { id: MODELS.GEMINI_3_8_FLASH_HIGH, label: "Gemini 3.8 Flash (High)" },
      { id: MODELS.GEMINI_3_8_FLASH_MEDIUM, label: "Gemini 3.8 Flash (Medium)" },
      { id: MODELS.GEMINI_3_8_FLASH_LOW, label: "Gemini 3.8 Flash (Low)" },
      { id: MODELS.GEMINI_3_7_FLASH_HIGH, label: "Gemini 3.7 Flash (High)" },
      { id: MODELS.GEMINI_3_7_FLASH_MEDIUM, label: "Gemini 3.7 Flash (Medium)" },
      { id: MODELS.GEMINI_3_7_FLASH_LOW, label: "Gemini 3.7 Flash (Low)" },
      { id: MODELS.GEMINI_3_1_PRO_HIGH, label: "Gemini 3.1 Pro (High)" },
      { id: MODELS.GEMINI_3_1_PRO_LOW, label: "Gemini 3.1 Pro (Low)" },
    ];
  },

  async getHelp(): Promise<string> {
    try {
      return await executeCommand(CLI.COMMANDS.AGY, [CLI.FLAGS.HELP]);
    } catch (e) {
      return `Antigravity CLI (agy) help unavailable: ${(e as Error).message}`;
    }
  },

  run(prompt: string, opts: BackendRunOptions): Promise<string> {
    const task = agyQueue.then(async () => {
      const cwd = process.cwd();
      const startMs = Date.now();
      const caps = await probeAgyCapabilities();
      const finalPrompt = buildAgyPrompt(prompt, opts);
      const baseArgs = buildAgyArgs(opts, caps);

      // Prompt delivery. stream-json puts the prompt on stdin, so an inlined
      // @file prompt is not bounded by the OS argv cap (32,767 chars on Windows:
      // `@package-lock.json` used to die with spawn ENAMETOOLONG). Older builds
      // keep `-p <prompt>`, with JSON stdout when they have it.
      //
      // One exception: agy answers a slash command in the CLI itself, and refuses
      // to under stream-json ("/usage is answered by the CLI itself and is
      // unavailable with --input-format stream-json"). So a caller who asked for
      // slash expansion gets argv delivery — a command is short, and this is the
      // only way `allowSlashCommands` does what it says.
      const viaStdin = caps.streamJsonInput && !isSlashCommand(finalPrompt, opts);
      if (viaStdin) {
        baseArgs.push(CLI.FLAGS.INPUT_FORMAT, "stream-json", CLI.FLAGS.OUTPUT_FORMAT, "stream-json");
      } else if (caps.outputFormatJson) {
        baseArgs.push(CLI.FLAGS.OUTPUT_FORMAT, "json");
      }
      if (caps.printTimeout) baseArgs.push("--print-timeout", agyPrintTimeoutArg());

      const parseOpts: ParseAgyJsonOptions = {
        preferStructured: !!opts.jsonSchema,
        includeUsage: opts.includeUsage,
      };

      const argsWithPrompt = viaStdin ? baseArgs : [...baseArgs, CLI.FLAGS.PROMPT, finalPrompt];
      const stdinData = viaStdin ? streamJsonUserMessage(finalPrompt) : undefined;

      // 1) Direct stdout — the clean path (JSON when available, else plain text).
      let stdout = "";
      let printError: Error | undefined;
      try {
        stdout = await executeCommand(CLI.COMMANDS.AGY, argsWithPrompt, opts.onProgress, stdinData);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        // Not installed: nothing further down the ladder can succeed.
        if (err.message.includes("Could not find")) throw err;
        // agy's own verdict (bad model, quota, auth) is JSON on stdout: surface it verbatim.
        const verdict = agyErrorText(agyResult((err as CommandError).stdout ?? "", viaStdin));
        if (verdict) throw new Error(verdict);
        Logger.warn(`agy: print-mode failed (${err.message}); trying recovery.`);
        printError = err;
      }
      const result = agyResult(stdout, viaStdin);
      const verdict = agyErrorText(result);
      if (verdict) throw new Error(verdict); // exit 0 but status ERROR
      const observedId = agyConversationId(result);
      if (observedId) opts.onConversationId?.(observedId);
      for (const n of agyResultNotices(result)) opts.onNotice?.(n);
      const direct = viaStdin
        ? result && parseAgyJsonResponse(JSON.stringify(result), parseOpts)
        : replyFrom(stdout, caps.outputFormatJson, parseOpts);
      if (direct) return direct;

      // 2) Opt-in PTY recovery: a TTY-only build prints under a pseudo-terminal.
      // (Not for stdin delivery: the prompt isn't in argsWithPrompt then.)
      if (!viaStdin && ptyEnabled()) {
        const ptyOut = await runAgyUnderPty(argsWithPrompt, opts.onProgress);
        const fromPty = replyFrom(ptyOut, caps.outputFormatJson, parseOpts);
        if (fromPty) return fromPty;
      }

      // 3) Transcript recovery. Trust an explicit/cwd conversation only if it was
      // written during this run; a fast agy failure (e.g. dropped auth) must not
      // surface a stale reply from a previous conversation in this cwd.
      const explicitId = opts.conversationId;
      const cwdId = conversationIdForCwd(cwd);
      const id =
        (explicitId && conversationFreshSince(explicitId, startMs) ? explicitId : undefined) ??
        (cwdId && conversationFreshSince(cwdId, startMs) ? cwdId : undefined) ??
        newestConversationSince(startMs);
      if (!id) {
        // agy emitted an error of its own (quota, auth, ...): surface it verbatim.
        if (printError) throw printError;
        // Truly silent: exit 0 with no stdout, stderr, or transcript.
        throw new Error(
          `agy produced no output for ${cwd} (no stdout, stderr, or transcript). ` +
            'Run `agy -p "hi"` directly to check for an expired login or exhausted quota.',
        );
      }
      opts.onConversationId?.(id);
      return readTranscriptResponse(id);
    });
    // Keep the chain alive regardless of this call's outcome.
    agyQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  },
};
