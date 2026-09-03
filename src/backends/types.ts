import type { ApprovalMode, ReasoningEffort, ExecutionMode } from "../constants.js";

/**
 * Options a backend understands. Backends interpret these in their own terms
 * (e.g. the gemini backend maps `resume` to `--resume`, the agy backend to
 * `--conversation`/`--continue`); unsupported options are safely handled.
 */
export interface BackendRunOptions {
  model?: string;
  effort?: ReasoningEffort;
  jsonSchema?: string | Record<string, unknown>;
  mode?: ExecutionMode;
  addDirs?: string[];
  conversationId?: string;
  includeUsage?: boolean;
  sandbox?: boolean;
  changeMode?: boolean;
  approvalMode?: ApprovalMode;
  sessionId?: string;
  resume?: string;
  onProgress?: (newOutput: string) => void;
  /**
   * Sink for human-facing notices the backend wants surfaced to the caller.
   * The tool layer prepends these to the response so behavior changes are never
   * silent. Backends should call it; the tool layer supplies it.
   */
  onNotice?: (message: string) => void;
}

export interface ModelInfo {
  id: string;
  label: string;
}

/** A pluggable CLI backend that turns a prompt into model output. */
export interface Backend {
  readonly name: string;
  /** Whether `model` selection is honoured. */
  readonly supportsModelSelection: boolean;
  /** Whether reasoning effort is configurable. */
  readonly supportsReasoningEffort?: boolean;
  /** Whether structured output (--json-schema) is supported. */
  readonly supportsStructuredOutput?: boolean;
  /** Whether agent execution modes (--mode accept-edits/plan) are supported. */
  readonly supportsModes?: boolean;
  /** Whether tool execution is actually isolated when `sandbox` is requested. */
  readonly sandboxIsolatesToolExecution: boolean;
  run(prompt: string, options: BackendRunOptions): Promise<string>;
  listModels?(): Promise<ModelInfo[]>;
  getHelp?(): Promise<string>;
}
