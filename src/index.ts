#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CallToolRequest,
  ListToolsRequest,
  ListPromptsRequest,
  GetPromptRequest,
  Tool,
  Prompt,
  GetPromptResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { realpathSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Logger } from "./utils/logger.js";
import { PROTOCOL, ToolArguments } from "./constants.js";

import { 
  getToolDefinitions, 
  getPromptDefinitions, 
  executeTool, 
  toolExists, 
  getPromptMessage 
} from "./tools/index.js";

export const server = new Server(
  {
    name: "gemini-relay",
    version: "1.2.0",
  },{
    capabilities: {
      tools: {},
      prompts: {},
      logging: {},
    },
  },
);

/**
 * Keepalive state for ONE tool call. Nothing lives at module scope: two calls
 * that overlap each own their interval, operation name and output preview.
 * While this state was shared, the first call to finish flipped the flag for
 * everyone, so the second call's interval cleared itself, its final
 * notification carried the other call's name, and its output preview leaked
 * across. agy runs are serialized behind a promise queue (backends/agy.ts), so
 * the silenced call is exactly the one queued for minutes — the one whose
 * client is about to give up on it.
 */
export interface ProgressState {
  interval: NodeJS.Timeout;
  progressToken?: string | number;
  operationName: string;
  processing: boolean;
  latestOutput: string;
}

async function sendNotification(method: string, params: any) {
  try {
    await server.notification({ method, params });
  } catch (error) {
    Logger.error("notification failed: ", error);
  }
}

/**
 * @param progressToken The progress token provided by the client
 * @param progress The current progress value
 * @param total Optional total value
 * @param message Optional status message
 */
async function sendProgressNotification(
  progressToken: string | number | undefined,
  progress: number,
  total?: number,
  message?: string
) {
  if (!progressToken) return; // Only send if client requested progress
  
  try {
    const params: any = {
      progressToken,
      progress
    };
    
    if (total !== undefined) params.total = total; // future cache progress
    if (message) params.message = message;
    
    await server.notification({
      method: PROTOCOL.NOTIFICATIONS.PROGRESS,
      params
    });
  } catch (error) {
    Logger.error("Failed to send progress notification:", error);
  }
}

export function startProgressUpdates(
  operationName: string,
  progressToken?: string | number
): ProgressState {
  const progressMessages = [
    `🧠 ${operationName} - Gemini is analyzing your request...`,
    `📊 ${operationName} - Processing files and generating insights...`,
    `✨ ${operationName} - Creating structured response for your review...`,
    `⏱️ ${operationName} - Large analysis in progress (this is normal for big requests)...`,
    `🔍 ${operationName} - Still working... Gemini takes time for quality results...`,
  ];
  
  let messageIndex = 0;
  let progress = 0;
  
  // Send immediate acknowledgment if progress requested
  if (progressToken) {
    sendProgressNotification(
      progressToken,
      0,
      undefined, // No total - indeterminate progress
      `🔍 Starting ${operationName}`
    );
  }
  
  // Keep client alive with periodic updates. The interval reads this call's own
  // state, so a sibling call finishing cannot silence it.
  const state: ProgressState = {
    operationName,
    progressToken,
    processing: true,
    latestOutput: "",
    interval: setInterval(async () => {
      if (state.processing && progressToken) {
        // Simply increment progress value
        progress += 1;

        // Include latest output if available
        const baseMessage = progressMessages[messageIndex % progressMessages.length];
        const outputPreview = state.latestOutput.slice(-150).trim(); // Last 150 chars
        const message = outputPreview
          ? `${baseMessage}\n📝 Output: ...${outputPreview}`
          : baseMessage;

        await sendProgressNotification(
          progressToken,
          progress,
          undefined, // No total - indeterminate progress
          message
        );
        messageIndex++;
      } else if (!state.processing) {
        clearInterval(state.interval);
      }
    }, PROTOCOL.KEEPALIVE_INTERVAL), // Every 25 seconds
  };

  return state;
}

export function stopProgressUpdates(
  progressData: ProgressState,
  success: boolean = true
) {
  progressData.processing = false;
  clearInterval(progressData.interval);

  // Send final progress notification if client requested progress
  if (progressData.progressToken) {
    sendProgressNotification(
      progressData.progressToken,
      100,
      100,
      success
        ? `✅ ${progressData.operationName} completed successfully`
        : `❌ ${progressData.operationName} failed`
    );
  }
}

// tools/list
server.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest): Promise<{ tools: Tool[] }> => {
  return { tools: getToolDefinitions() as unknown as Tool[] };
});

// tools/get
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
  const toolName: string = request.params.name;

  if (toolExists(toolName)) {
    // Check if client requested progress updates
    const progressToken = (request.params as any)._meta?.progressToken;
    
    // Start progress updates if client requested them
    const progressData = startProgressUpdates(toolName, progressToken);
    
    try {
      // Get prompt and other parameters from arguments with proper typing
      const args: ToolArguments = (request.params.arguments as ToolArguments) || {};

      Logger.toolInvocation(toolName, request.params.arguments);

      // Execute the tool using the unified registry with progress callback
      const result = await executeTool(toolName, args, (newOutput) => {
        progressData.latestOutput = newOutput;
      });

      // Stop progress updates
      stopProgressUpdates(progressData, true);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      // Stop progress updates on error
      stopProgressUpdates(progressData, false);
      
      Logger.error(`Error in tool '${toolName}':`, error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: "text",
            text: `Error executing ${toolName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  } else {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// prompts/list
server.setRequestHandler(ListPromptsRequestSchema, async (request: ListPromptsRequest): Promise<{ prompts: Prompt[] }> => {
  return { prompts: getPromptDefinitions() as unknown as Prompt[] };
});

// prompts/get
server.setRequestHandler(GetPromptRequestSchema, async (request: GetPromptRequest): Promise<GetPromptResult> => {
  const promptName = request.params.name;
  const args = request.params.arguments || {};
  
  const promptMessage = getPromptMessage(promptName, args);
  
  if (!promptMessage) {
    throw new Error(`Unknown prompt: ${promptName}`);
  }
  
  return { 
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text: promptMessage
      }
    }]
  };
});

// Start the server
async function main() {
  Logger.debug("init gemini-relay");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  Logger.debug("gemini-relay listening on stdio");
}

// Auto-start only when this file IS the process entry (`node dist/index.js`, or
// the npm bin symlink, which realpathSync resolves). Importing the module — the
// progress tests do, to drive overlapping calls — must not bind stdio.
// Compared case-insensitively: on Windows the drive letter in argv[1] and in
// import.meta.url can differ in case. Unknowable -> start, as before.
function launchedDirectly(): boolean {
  try {
    const entry = realpathSync(process.argv[1]);
    // `node .` / `node dist` hand us a directory, which node then resolves to
    // this file via package.json "main" — a directory is never an import, so
    // that is always a direct launch.
    if (statSync(entry).isDirectory()) return true;
    return pathToFileURL(entry).href.toLowerCase() === import.meta.url.toLowerCase();
  } catch {
    return true;
  }
}

if (launchedDirectly()) {
  main().catch((error) => {Logger.error("Fatal error:", error); process.exit(1); });
}
