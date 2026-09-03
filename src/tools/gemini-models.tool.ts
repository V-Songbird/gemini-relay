import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { getBackend, backendSelection } from '../backends/index.js';
import { MODELS } from '../constants.js';

const geminiModelsArgsSchema = z.object({});

export const geminiModelsTool: UnifiedTool = {
  name: "gemini-models",
  description: "Lists available Gemini models, default selections, reasoning capabilities, and active backend status.",
  zodSchema: geminiModelsArgsSchema,
  prompt: {
    description: "List available Gemini models and active CLI backend capabilities.",
  },
  category: 'gemini',
  execute: async (_args, _onProgress) => {
    const { backend, notices } = backendSelection();
    let modelsList = "";

    if (backend.listModels) {
      try {
        const models = await backend.listModels();
        modelsList = models.map((m) => `  • **${m.id}**: ${m.label}`).join("\n");
      } catch {
        // Fallback to static list
      }
    }

    if (!modelsList) {
      modelsList = [
        `  • **${MODELS.GEMINI_3_8_FLASH_HIGH}**: Gemini 3.8 Flash (High Reasoning) - Fast with deep thinking`,
        `  • **${MODELS.GEMINI_3_8_FLASH_MEDIUM}**: Gemini 3.8 Flash (Medium Reasoning)`,
        `  • **${MODELS.GEMINI_3_8_FLASH_LOW}**: Gemini 3.8 Flash (Low Reasoning) - Ultra fast`,
        `  • **${MODELS.GEMINI_3_1_PRO_HIGH}**: Gemini 3.1 Pro (High Reasoning) - Flagship reasoning`,
        `  • **${MODELS.GEMINI_3_1_PRO_LOW}**: Gemini 3.1 Pro (Low Reasoning)`,
        `  • **${MODELS.GEMINI_3_7_FLASH_HIGH}**: Gemini 3.7 Flash (High Reasoning)`,
      ].join("\n");
    }

    const noticesSection = notices.length
      ? `\n\n**Backend Notices:**\n${notices.map((n) => `> ⚠️ ${n}`).join("\n")}`
      : "";

    return `### Active Backend: **${backend.name.toUpperCase()}**
- **Default Model:** \`${MODELS.DEFAULT}\`
- **Model Selection:** ${backend.supportsModelSelection ? "✅ Supported" : "❌ Fixed"}
- **Reasoning Effort Control:** ${backend.supportsReasoningEffort ? "✅ Supported ('low', 'medium', 'high')" : "❌ Not supported"}
- **Structured Output (--json-schema):** ${backend.supportsStructuredOutput ? "✅ Supported" : "❌ Not supported"}
- **Agent Modes (--mode plan/accept-edits):** ${backend.supportsModes ? "✅ Supported" : "❌ Not supported"}
- **Tool Sandbox:** ${backend.sandboxIsolatesToolExecution ? "✅ Isolated" : "⚠️ Host-executed in headless"}

### Available Models:
${modelsList}${noticesSection}

💡 *Tip: You can pass \`model: 'gemini-3.8-flash-high'\` or aliases like \`model: 'pro'\` or \`model: 'flash'\` to \`ask-gemini\`.*`;
  },
};
