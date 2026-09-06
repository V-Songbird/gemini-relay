import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { processChangeModeOutput } from '../utils/geminiExecutor.js';
import { runWithBackend, withNotices } from '../backends/index.js';
import {
  APPROVAL_MODES,
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  type ReasoningEffort,
  type ExecutionMode,
} from '../constants.js';

const askGeminiArgsSchema = z.object({
  prompt: z.string().min(1).describe("Analysis request. Use @ syntax to include files (e.g., '@largefile.js explain what this does') or ask general questions"),
  model: z.string().optional().describe("Model to use — any id 'gemini-models' lists, or the aliases 'flash' and 'pro'. Leave it unset and no --model is sent at all, so agy answers on whatever model it is itself configured to use."),
  effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort ('low', 'medium', 'high') for Gemini 3.8 Flash, 3.7 Flash, and 3.1 Pro. Controls depth of thinking tokens."),
  mode: z.enum(['accept-edits', 'plan']).optional().describe("Agent execution mode: 'plan' for architectural analysis without modifying files, 'accept-edits' for direct edit application."),
  jsonSchema: z.union([z.string(), z.record(z.unknown())]).optional().describe("Optional JSON schema to enforce structured output from Gemini."),
  addDirs: z.array(z.string()).optional().describe("Optional additional workspace directories to provide context to Gemini."),
  conversationId: z.string().optional().describe("Optional conversation ID to resume a previous session. A plain-text reply reports the ID of the conversation it created or continued; a jsonSchema or changeMode reply does not, because its body is parsed."),
  agent: z.string().optional().describe("Optional custom agent to run instead of the default one (the name of an agent.md agent, e.g. a reviewer persona). Ignored by an agy build without --agent."),
  allowSlashCommands: z.boolean().default(false).describe("Set to true to let a prompt starting with '/' expand as an agy command or skill (e.g. '/usage', '/skills'), which answers for free without a model turn. Default false: the prompt goes to the model verbatim."),
  skipPermissions: z.boolean().default(false).describe("Set to true to run agy with --dangerously-skip-permissions. This genuinely changes behaviour: since agy 1.1.5 headless runs honour the persisted permission settings, so without it a tool call the settings do not allow is refused with nobody there to approve it."),
  includeUsage: z.boolean().default(false).describe("Set to true to append token usage and timing metrics to the response. Ignored when jsonSchema is set, so the body stays valid JSON."),
  sandbox: z.boolean().default(false).describe("Ask the CLI to run in sandbox mode. The agy backend forwards it but does not isolate tool execution in headless runs, and says so in a notice; the legacy gemini backend does isolate."),
  changeMode: z.boolean().default(false).describe("Enable structured change mode - formats prompts to prevent tool errors and returns structured edit suggestions that Claude can apply directly"),
  chunkIndex: z.union([z.number(), z.string()]).optional().describe("Which chunk of a changeMode response to return (1-based). With chunkCacheKey it reads the cached chunk; alone, it selects which chunk of a fresh changeMode result to return."),
  chunkCacheKey: z.string().optional().describe("The 8-hex-character cache key a multi-chunk changeMode response reported, to fetch a later chunk without re-running the analysis."),
});

export const askGeminiTool: UnifiedTool = {
  name: "ask-gemini",
  description: "Query Google Gemini (Gemini 3.8 / 3.7 / 3.6 Flash, 3.1 Pro) — or the Claude and GPT-OSS models the Antigravity CLI also offers — for analysis, reasoning, architectural planning and code changes. Reference project files with @path to send their contents along.",
  zodSchema: askGeminiArgsSchema,
  prompt: {
    description: "Query Gemini AI with prompt, optional model selection, reasoning effort, planning mode, and structured output.",
  },
  category: 'gemini',
  execute: async (args, onProgress) => {
    const {
      prompt,
      model,
      effort,
      mode,
      jsonSchema,
      addDirs,
      conversationId,
      agent,
      allowSlashCommands,
      skipPermissions,
      includeUsage,
      sandbox,
      changeMode,
      chunkIndex,
      chunkCacheKey,
    } = args;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED);
    }

    if (changeMode && chunkIndex && chunkCacheKey) {
      // Security: validate cacheKey format before any cache access
      if (typeof chunkCacheKey !== 'string' || !/^[a-f0-9]{8}$/.test(chunkCacheKey)) {
        return `❌ Invalid chunkCacheKey format. Expected 8 lowercase hex characters (got ${JSON.stringify(chunkCacheKey)}).`;
      }
      return processChangeModeOutput(
        '', // empty for cache...
        chunkIndex as number,
        chunkCacheKey as string,
        prompt as string
      );
    }

    const { text: result, notices, conversationId: threadId } = await runWithBackend(prompt as string, {
      model: model as string | undefined,
      effort: effort as ReasoningEffort | undefined,
      mode: mode as ExecutionMode | undefined,
      jsonSchema: jsonSchema as string | Record<string, unknown> | undefined,
      addDirs: addDirs as string[] | undefined,
      conversationId: conversationId as string | undefined,
      agent: agent as string | undefined,
      allowSlashCommands: !!allowSlashCommands,
      approvalMode: skipPermissions ? APPROVAL_MODES.YOLO : undefined,
      includeUsage: !!includeUsage,
      sandbox: !!sandbox,
      changeMode: !!changeMode,
      onProgress,
    });

    if (changeMode) {
      const processed = await processChangeModeOutput(
        result,
        args.chunkIndex as number | undefined,
        undefined,
        prompt as string
      );
      return withNotices(notices, processed);
    }
    // The thread id, so a follow-up needs no digging in agy's private cache. Never
    // in changeMode (parsed for OLD/NEW blocks) or with a schema (parsed as JSON).
    const thread =
      threadId && !jsonSchema ? `\n\n🧵 conversationId: ${threadId} (pass it back to continue this thread)` : "";
    return withNotices(notices, `${STATUS_MESSAGES.GEMINI_RESPONSE}\n${result}${thread}`);
  }
};