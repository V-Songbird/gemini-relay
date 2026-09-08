import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { listConversations } from '../backends/agyTranscript.js';

const conversationsArgsSchema = z.object({
  limit: z.number().int().positive().max(100).default(20).describe("How many conversations to list, newest first (default 20, max 100)."),
});

export const geminiConversationsTool: UnifiedTool = {
  name: "gemini-conversations",
  description: "List recent Gemini conversations the relay can resume: id, last activity, working directory, first prompt. Pass an id to gemini-ask as conversationId to continue that thread. Reads agy's local store; no model turn.",
  zodSchema: conversationsArgsSchema,
  prompt: {
    description: "List recent Gemini conversations and their ids.",
  },
  category: 'utility',
  execute: async (args) => {
    const rows = listConversations(Number(args.limit) || 20);
    if (rows.length === 0) {
      return "No conversations found. Run gemini-ask once and it will report the id it created.";
    }
    const lines = [
      "| id | last active | cwd | first prompt |",
      "| --- | --- | --- | --- |",
      ...rows.map((c) =>
        `| \`${c.id}\` | ${new Date(c.lastActiveMs).toISOString()} | ${c.cwd ?? ""} | ${(c.firstPrompt ?? "").replace(/\|/g, "\\|")} |`,
      ),
      "",
      "Continue one with gemini-ask and `conversationId: \"<id>\"`.",
    ];
    return lines.join("\n");
  },
};
