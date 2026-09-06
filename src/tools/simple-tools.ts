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
  execute: async (args, _onProgress) => {
    // A liveness echo needs no subprocess. Spawning the cmd.exe `echo` builtin
    // returned the message wrapped in the double quotes commandExecutor adds for
    // cmd safety — `ping "hello & world"` answered `"hello & world"` (audit bug 10).
    // Only `prompt` survives: the zod schema strips every other key.
    return String(args.prompt || "Pong!");
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
