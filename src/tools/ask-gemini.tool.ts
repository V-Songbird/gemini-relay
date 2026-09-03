import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { processChangeModeOutput } from '../utils/geminiExecutor.js';
import { runWithBackend, withNotices } from '../backends/index.js';
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  type ReasoningEffort,
  type ExecutionMode,
} from '../constants.js';

const askGeminiArgsSchema = z.object({
  prompt: z.string().min(1).describe("Analysis request. Use @ syntax to include files (e.g., '@largefile.js explain what this does') or ask general questions"),
  model: z.string().optional().describe("Gemini model to use (e.g., 'gemini-3.8-flash-high', 'gemini-3.1-pro-high', 'flash', 'pro'). Default: 'gemini-3.8-flash-high'."),
  effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort ('low', 'medium', 'high') for Gemini 3.8 Flash, 3.7 Flash, and 3.1 Pro. Controls depth of thinking tokens."),
  mode: z.enum(['accept-edits', 'plan']).optional().describe("Agent execution mode: 'plan' for architectural analysis without modifying files, 'accept-edits' for direct edit application."),
  jsonSchema: z.union([z.string(), z.record(z.unknown())]).optional().describe("Optional JSON schema to enforce structured output from Gemini."),
  addDirs: z.array(z.string()).optional().describe("Optional additional workspace directories to provide context to Gemini."),
  conversationId: z.string().optional().describe("Optional conversation ID to resume a previous session."),
  includeUsage: z.boolean().default(false).describe("Set to true to append token usage and timing metrics to the response."),
  sandbox: z.boolean().default(false).describe("Use sandbox mode (-s flag) to safely test code changes, execute scripts, or run potentially risky operations in an isolated environment"),
  changeMode: z.boolean().default(false).describe("Enable structured change mode - formats prompts to prevent tool errors and returns structured edit suggestions that Claude can apply directly"),
  chunkIndex: z.union([z.number(), z.string()]).optional().describe("Which chunk to return (1-based)"),
  chunkCacheKey: z.string().optional().describe("Optional cache key for continuation"),
});

export const askGeminiTool: UnifiedTool = {
  name: "ask-gemini",
  description: "Query Google Gemini (Gemini 3.8 Flash / 3.1 Pro) for analysis, reasoning, architectural planning, and code changes with massive context window.",
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

    const { text: result, notices } = await runWithBackend(prompt as string, {
      model: model as string | undefined,
      effort: effort as ReasoningEffort | undefined,
      mode: mode as ExecutionMode | undefined,
      jsonSchema: jsonSchema as string | Record<string, unknown> | undefined,
      addDirs: addDirs as string[] | undefined,
      conversationId: conversationId as string | undefined,
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
    return withNotices(notices, `${STATUS_MESSAGES.GEMINI_RESPONSE}\n${result}`);
  }
};