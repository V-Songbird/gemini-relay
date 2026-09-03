# Gemini MCP Tool

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/V-Songbird/gemini-mcp-tool?logo=github&label=GitHub)](https://github.com/V-Songbird/gemini-mcp-tool/releases)
[![npm version](https://img.shields.io/npm/v/gemini-mcp-tool)](https://www.npmjs.com/package/gemini-mcp-tool)
[![npm downloads](https://img.shields.io/npm/dt/gemini-mcp-tool)](https://www.npmjs.com/package/gemini-mcp-tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://img.shields.io/badge/Open%20Source-❤️-red.svg)](https://github.com/V-Songbird/gemini-mcp-tool)

</div>

> 📚 **[View Full Documentation](https://V-Songbird.github.io/gemini-mcp-tool/)** - Search, Examples, FAQ, Troubleshooting, Best Practices  
> 🤖 **[Agent Integration & Recipes Guide](docs/AGENT_GUIDE.md)** - Best practices, prompt patterns, and workflows for Claude Code & AI agents  
> 📝 **[Claude Code Instructions (CLAUDE.md)](CLAUDE.md)** - Auto-loaded agent rules and pairing instructions

A powerful Model Context Protocol (MCP) server that connects AI coding assistants (such as **Claude Code**, Cursor, Windsurf, Claude Desktop, and custom agents) directly to **Google Gemini** (Gemini 3.8 Flash, Gemini 3.7 Flash, and Gemini 3.1 Pro) via Google's modern **Antigravity CLI** (`agy`) and legacy Gemini CLI.

Leverage Gemini's **massive token window**, **deep reasoning effort**, **agent modes**, and **structured schema outputs** directly within your favorite development workflows.

---

## 🌟 What's New in v1.2.0: Gemini 3.8 & Modern Antigravity CLI

- ⚡ **Gemini 3.8 Flash & Gemini 3.1 Pro**: Native support for Google's latest models:
  - `gemini-3.8-flash-high` (Default - ultra fast with deep reasoning)
  - `gemini-3.8-flash-medium` & `gemini-3.8-flash-low`
  - `gemini-3.1-pro-high` (Flagship complex reasoning) & `gemini-3.1-pro-low`
  - `gemini-3.7-flash` family
- 🧠 **Reasoning Effort Control**: Fine-tune thinking token depth with `effort: "low" | "medium" | "high"`.
- 📐 **Structured Output (`jsonSchema`)**: Enforce valid JSON conforming to any provided JSON schema.
- 🏗️ **`gemini-plan` Tool**: Dedicated architectural planner utilizing Gemini's plan mode (`--mode plan`) and high reasoning effort for non-destructive, phased implementation blueprints.
- 🎨 **`gemini-image` Tool**: Dedicated visual asset and image generation tool powered by Google Imagen / Gemini visual models with aspect ratio control and direct project file export.
- 📋 **`gemini-models` Tool**: Query available Gemini models, backend status, and capability matrix.
- 🩺 **`gemini-doctor` Tool**: In-depth environment diagnostic verifying CLI installations (`agy` and `gemini`), versions, and system readiness.
- 📊 **Token Usage Metrics**: Detailed metrics including thinking tokens, input/output tokens, and duration via `includeUsage: true`.
- 🪟 **Enhanced Windows Compatibility**: Direct binary execution for `agy.exe` bypassing `cmd.exe` character limits and multiline newline corruption.

---

## 🚀 Quick Start with Claude Code

### One-Line Setup

```bash
claude mcp add gemini-cli -- npx -y gemini-mcp-tool
```

*(On Windows, you can also use `claude mcp add gemini-cli -- npx -- y gemini-mcp-tool`)*

### Verify Installation

In Claude Code, run:
```
/mcp
```
or ask Claude to run `gemini-doctor`:
```
"Run gemini-doctor to check the MCP server status"
```

---

## 🛠️ MCP Tools Overview

### 1. `ask-gemini`
Primary interface to query Gemini with massive context windows, file inlining, and reasoning controls.
- **Parameters**:
  - `prompt` (*string*, required): Your question or analysis task. Supports `@path/to/file` syntax to inline local files.
  - `model` (*string*, optional): Gemini model (e.g. `'gemini-3.8-flash-high'`, `'gemini-3.1-pro-high'`, or aliases `'flash'`, `'pro'`). Default: `'gemini-3.8-flash-high'`.
  - `effort` (*'low' | 'medium' | 'high'*, optional): Control thinking token depth for reasoning models.
  - `mode` (*'accept-edits' | 'plan'*, optional): Agent execution mode (`'plan'` for non-destructive analysis).
  - `jsonSchema` (*string | object*, optional): JSON schema to guarantee structured output.
  - `addDirs` (*string[]*, optional): Additional directories to include in workspace context.
  - `includeUsage` (*boolean*, default `false`): Append token usage metrics (including thinking tokens) and execution duration.
  - `changeMode` (*boolean*, default `false`): Formats prompts for structured multi-file edit suggestions.
  - `sandbox` (*boolean*, default `false`): Run in sandboxed environment.

### 2. `gemini-plan`
High-reasoning architectural and implementation blueprint generator.
- **Parameters**:
  - `task` (*string*, required): Architectural goal, complex feature, or refactor to design.
  - `context` (*string*, optional): Constraints, requirements, or reference files (`@file`).
  - `model` (*string*, optional): Default `'gemini-3.8-flash-high'`.
  - `effort` (*'low' | 'medium' | 'high'*, default `'high'`): Maximum thinking depth for comprehensive planning.
  - `addDirs` (*string[]*, optional): Directories for workspace visibility.
  - `includeUsage` (*boolean*, default `true`): Appends token and timing metrics.

### 3. `gemini-image`
Generates high-quality visual assets and illustrations from text descriptions using Google Imagen & Gemini.
- **Parameters**:
  - `prompt` (*string*, required): Visual description of the image (subject, environment, lighting, artistic style).
  - `aspectRatio` (*enum*, optional): `'1:1'` *(default)*, `'16:9'`, `'9:16'`, `'4:3'`, `'3:4'`, `'3:2'`, `'2:3'`.
  - `outputPath` (*string*, optional): Relative workspace path to save/copy the generated image (e.g. `'assets/hero.png'`).

### 4. `gemini-models`
Inspects available Gemini models, reasoning tiers, active backend status, and capability flags.

### 5. `gemini-doctor`
Diagnoses your environment, detecting installed CLIs (`agy` and `gemini`), versions, and paths.

### 6. `brainstorm`
Generates creative, multi-angle ideas using structured frameworks (SCAMPER, Design Thinking, Divergent/Convergent, Lateral Thinking) with optional reasoning effort.

### 7. `fetch-chunk`
Retrieves paginated chunks from cached large multi-file edit suggestions generated during `changeMode`.

### 8. `ping` & `Help`
Simple diagnostic echo and CLI help information.

---

## ⚙️ Configuration & Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_MCP_BACKEND` | `agy` | Active CLI backend: `agy` (Antigravity CLI, recommended) or `gemini` (legacy). |
| `AGY_CLI_PATH` | auto-detected | Explicit path to `agy` binary (`agy.exe` on Windows, `~/.local/bin/agy` on Unix). |
| `GEMINI_CLI_PATH` | auto-detected | Explicit path to legacy `gemini` CLI executable. |
| `GEMINI_MCP_TIMEOUT` | `45` | Maximum execution timeout in minutes. |
| `AGY_PRINT_TIMEOUT` | `44m` | Timeout passed directly to `agy --print-timeout`. |

---

## 💻 Manual MCP Client Configuration

### Claude Desktop
Add to your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gemini-cli": {
      "command": "npx",
      "args": ["-y", "gemini-mcp-tool"]
    }
  }
}
```

### Cursor / Windsurf
Add a new MCP server in settings:
- **Name**: `gemini-cli`
- **Type**: `command`
- **Command**: `npx -y gemini-mcp-tool`

---

## 🧪 Testing & Verification

Run tests to verify server functionality and CLI integration:

```bash
# Verify environment setup
npm run doctor

# Run full unit + integration + e2e test suite
npm test

# Run unit tests only
npm run test:unit

# Run live e2e tests through active CLI backend
npm run test:e2e
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

*Disclaimer: This is an open-source tool and is not officially affiliated with or endorsed by Google.*
