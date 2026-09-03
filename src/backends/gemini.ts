import { executeGeminiCLI } from "../utils/geminiExecutor.js";
import { executeCommand } from "../utils/commandExecutor.js";
import { CLI, MODELS } from "../constants.js";
import type { Backend, BackendRunOptions, ModelInfo } from "./types.js";

/**
 * Legacy backend: the Google Gemini CLI (`gemini`). It inlines `@file`
 * references itself, honours `-m/--model`, and implements the Pro->Flash quota
 * fallback inside executeGeminiCLI. Retired 2026-06-18 for free/Pro/Ultra tiers.
 */
export const geminiBackend: Backend = {
  name: "gemini",
  supportsModelSelection: true,
  supportsReasoningEffort: false,
  supportsStructuredOutput: false,
  supportsModes: false,
  sandboxIsolatesToolExecution: true,

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: MODELS.LEGACY_2_5_PRO, label: "Gemini 2.5 Pro" },
      { id: MODELS.LEGACY_2_5_FLASH, label: "Gemini 2.5 Flash" },
    ];
  },

  async getHelp(): Promise<string> {
    try {
      return await executeCommand(CLI.COMMANDS.GEMINI, [CLI.FLAGS.HELP]);
    } catch (e) {
      return `Gemini CLI help unavailable: ${(e as Error).message}`;
    }
  },

  run(prompt: string, opts: BackendRunOptions): Promise<string> {
    return executeGeminiCLI(
      prompt,
      opts.model,
      !!opts.sandbox,
      !!opts.changeMode,
      opts.onProgress,
    );
  },
};
