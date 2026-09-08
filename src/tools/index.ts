// Tool Registry Index - Registers all tools
import { toolRegistry } from './registry.js';
import { askGeminiTool } from './gemini-ask.tool.js';
import { pingTool, helpTool, cancelTool } from './simple-tools.js';
import { geminiConversationsTool } from './gemini-conversations.tool.js';
import { brainstormTool } from './gemini-brainstorm.tool.js';
import { fetchChunkTool } from './gemini-fetch-chunk.tool.js';
import { geminiPlanTool } from './gemini-plan.tool.js';
import { geminiModelsTool } from './gemini-models.tool.js';
import { geminiDoctorTool } from './gemini-doctor.tool.js';
import { geminiImageTool } from './gemini-image.tool.js';
import { timeoutTestTool } from './gemini-timeout-test.tool.js';

toolRegistry.push(
  askGeminiTool,
  geminiPlanTool,
  geminiImageTool,
  geminiModelsTool,
  geminiDoctorTool,
  brainstormTool,
  fetchChunkTool,
  geminiConversationsTool,
  cancelTool,
  pingTool,
  helpTool
);

// Only register test-only tools when explicitly enabled (e.g. judge/e2e test suite)
if (process.env.GEMINI_MCP_TEST_TOOLS) {
  toolRegistry.push(timeoutTestTool);
}

export * from './registry.js';
export {
  askGeminiTool,
  geminiPlanTool,
  geminiImageTool,
  geminiModelsTool,
  geminiDoctorTool,
  brainstormTool,
  fetchChunkTool,
  geminiConversationsTool,
  cancelTool,
  pingTool,
  helpTool,
};