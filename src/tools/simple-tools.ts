import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeCommand, cancelRunningCommands } from '../utils/commandExecutor.js';
import { CLI } from '../constants.js';

const pingArgsSchema = z.object({
  prompt: z.string().default('').describe("Message to echo "),
});

export const pingTool: UnifiedTool = {
  name: "gemini-ping",
  description: "Liveness check: echoes the prompt back from the relay itself, without touching the CLI or any model. Use gemini-doctor to check the CLI.",
  zodSchema: pingArgsSchema,
  prompt: {
    description: "Echo a message back to prove the relay is alive.",
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
  name: "gemini-help",
  description: "Print the active backend CLI's own --help text (agy or gemini), to see which flags the installed version supports.",
  zodSchema: helpArgsSchema,
  prompt: {
    description: "Show the backend CLI's --help output.",
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

export const cancelTool: UnifiedTool = {
  name: "gemini-cancel",
  description: "Stop every Gemini CLI run the relay has in flight right now: a slow gemini-ask, gemini-plan, gemini-brainstorm or gemini-image. Each cancelled call returns an error to its caller. Nothing else is touched.",
  zodSchema: z.object({}),
  prompt: {
    description: "Cancel the Gemini runs currently in flight.",
  },
  category: 'utility',
  execute: async () => {
    const count = cancelRunningCommands();
    return count === 0 ? "Nothing was running." : `Cancelled ${count} run${count === 1 ? "" : "s"}.`;
  },
};
