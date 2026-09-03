import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { runWithBackend, withNotices } from '../backends/index.js';
import { type ReasoningEffort } from '../constants.js';

const geminiPlanArgsSchema = z.object({
  task: z.string().min(1).describe("The architectural task, complex feature, or refactoring goal to plan out."),
  context: z.string().optional().describe("Additional context, constraints, or reference files (supports @file syntax)."),
  model: z.string().optional().describe("Gemini model to use (default: 'gemini-3.8-flash-high' or 'gemini-3.1-pro-high')."),
  effort: z.enum(['low', 'medium', 'high']).default('high').describe("Reasoning effort level (default: 'high'). Allocates deep thinking tokens for comprehensive plan design."),
  addDirs: z.array(z.string()).optional().describe("Additional directories to add to workspace context."),
  includeUsage: z.boolean().default(true).describe("Include token metrics in the response."),
});

export const geminiPlanTool: UnifiedTool = {
  name: "gemini-plan",
  description: "Architectural and implementation planner powered by Gemini's deep reasoning. Generates structured, phased implementation blueprints, dependency analysis, and risk assessments without modifying code.",
  zodSchema: geminiPlanArgsSchema,
  prompt: {
    description: "Create a detailed implementation blueprint for a task using Gemini's high-effort reasoning and plan mode.",
  },
  category: 'gemini',
  execute: async (args, onProgress) => {
    const { task, context, model, effort = 'high', addDirs, includeUsage = true } = args;

    if (!task || typeof task !== 'string' || !task.trim()) {
      throw new Error("Please provide a task or goal to plan.");
    }

    const contextStr = typeof context === 'string' ? context.trim() : '';

    const planPrompt = `# ARCHITECTURAL & IMPLEMENTATION PLANNING REQUEST

## Goal / Task:
${task.trim()}

${contextStr ? `## Context & Constraints:\n${contextStr}\n` : ''}

## Instructions:
1. Conduct a thorough architectural and requirement analysis.
2. Break down the solution into discrete, logically ordered implementation phases.
3. Identify dependencies, potential edge cases, risks, and verification steps for each phase.
4. Keep the plan actionable, clear, and ready for execution by an engineer or coding agent.
5. Provide code signatures, schema sketches, or pseudocode where precision is needed.

Please formulate the comprehensive plan:`;

    onProgress?.("🧠 Gemini is formulating deep architectural plan with high reasoning effort...");

    const { text, notices } = await runWithBackend(planPrompt, {
      model: (model as string | undefined) || "gemini-3.8-flash-high",
      effort: effort as ReasoningEffort,
      mode: "plan",
      addDirs: addDirs as string[] | undefined,
      includeUsage: !!includeUsage,
      onProgress,
    });

    return withNotices(notices, text);
  },
};
