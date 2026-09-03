import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeCommand } from '../utils/commandExecutor.js';
import { CLI } from '../constants.js';

const pingArgsSchema = z.object({
  prompt: z.string().default('').describe("Message to echo "),
});

export const pingTool: UnifiedTool = {
  name: "ping",
  description: "Echo",
  zodSchema: pingArgsSchema,
  prompt: {
    description: "Echo test message with structured response.",
  },
  category: 'simple',
  execute: async (args, onProgress) => {
    const message = args.prompt || args.message || "Pong!";
    return executeCommand(CLI.COMMANDS.ECHO, [message as string], onProgress);
  }
};

import { backendSelection } from '../backends/index.js';

const helpArgsSchema = z.object({});

export const helpTool: UnifiedTool = {
  name: "Help",
  description: "Receive CLI help information for the active Gemini backend",
  zodSchema: helpArgsSchema,
  prompt: {
    description: "Receive CLI help information for the active Gemini backend",
  },
  category: 'simple',
  execute: async (_args, _onProgress) => {
    const { backend } = backendSelection();
    if (backend.getHelp) {
      return backend.getHelp();
    }
    const cmd = backend.name === "agy" ? CLI.COMMANDS.AGY : CLI.COMMANDS.GEMINI;
    return executeCommand(cmd, [CLI.FLAGS.HELP]);
  }
};
