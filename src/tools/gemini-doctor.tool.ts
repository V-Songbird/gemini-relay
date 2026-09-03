import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { getBackend, backendSelection } from '../backends/index.js';
import { CLI, ENV, RETIREMENT } from '../constants.js';
import { resolveCommandForExecution } from '../utils/commandExecutor.js';
import { execSync } from 'child_process';

const geminiDoctorArgsSchema = z.object({});

export const geminiDoctorTool: UnifiedTool = {
  name: "gemini-doctor",
  description: "Diagnose and verify Gemini CLI / Antigravity CLI (agy) installation, active backend, CLI version, and system readiness.",
  zodSchema: geminiDoctorArgsSchema,
  prompt: {
    description: "Run diagnostic checks on Gemini CLI / Antigravity CLI environment and report status.",
  },
  category: 'simple',
  execute: async (_args, _onProgress) => {
    const { backend } = backendSelection();
    const isWindows = process.platform === "win32";

    let agyFound = false;
    let agyPath = "";
    let agyVersion = "";
    try {
      agyPath = resolveCommandForExecution(CLI.COMMANDS.AGY);
      const out = execSync(`"${agyPath}" --version`, { encoding: "utf8", timeout: 5000, windowsHide: true });
      agyVersion = out.trim().split(/\r?\n/)[0];
      agyFound = true;
    } catch {
      agyFound = false;
    }

    let geminiFound = false;
    let geminiPath = "";
    let geminiVersion = "";
    try {
      geminiPath = resolveCommandForExecution(CLI.COMMANDS.GEMINI);
      const out = execSync(`"${geminiPath}" --version`, { encoding: "utf8", timeout: 5000, windowsHide: true });
      geminiVersion = out.trim().split(/\r?\n/)[0];
      geminiFound = true;
    } catch {
      geminiFound = false;
    }

    return `### Gemini MCP Tool Doctor & Environment Diagnostic

**Runtime Environment:**
- Node.js: \`${process.version}\`
- OS: \`${process.platform} (${process.arch})\`
- Active Backend: **\`${backend.name.toUpperCase()}\`** (via \`${process.env[ENV.BACKEND] ? ENV.BACKEND : 'auto-default'}\`)

**Antigravity CLI (\`agy\`) - Modern Default:**
- Status: ${agyFound ? `✅ Installed (\`${agyVersion}\`)` : "❌ Not found"}
- Executable: \`${agyPath || 'not resolved'}\`
- Model Selection: ${backend.name === 'agy' ? (backend.supportsModelSelection ? "✅ Yes" : "❌ No") : "N/A"}
- Reasoning Effort: ${backend.name === 'agy' ? (backend.supportsReasoningEffort ? "✅ Yes" : "❌ No") : "N/A"}
- Structured Output: ${backend.name === 'agy' ? (backend.supportsStructuredOutput ? "✅ Yes" : "❌ No") : "N/A"}

**Gemini CLI (\`gemini\`) - Legacy Backend:**
- Status: ${geminiFound ? `✅ Installed (\`${geminiVersion}\`)` : "⚠️ Not installed (retired on " + RETIREMENT.GEMINI_CLI_ISO + ")"}
- Executable: \`${geminiPath || 'not resolved'}\`

${agyFound ? "🎉 **System Ready!** The modern Antigravity CLI backend is active and operational." : "⚠️ **Action needed:** Install Antigravity CLI: `" + RETIREMENT.AGY_INSTALL_CMD + "`"}`;
  },
};
