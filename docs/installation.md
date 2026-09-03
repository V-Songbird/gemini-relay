# Installation

Multiple ways to install Gemini Relay, depending on your needs.

## Prerequisites

- Node.js v18.0.0 or higher
- Claude Code, Claude Desktop, Cursor, or Windsurf with MCP support
- Google Antigravity CLI (`agy`) or Gemini CLI installed and authenticated

## Method 1: NPX (Recommended for Claude Code)

Add with a single command:

```bash
claude mcp add gemini-relay -- npx -y gemini-relay
```

## Method 2: Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gemini-relay": {
      "command": "npx",
      "args": ["-y", "gemini-relay"]
    }
  }
}
```

## Method 3: Local Project / Global

```bash
npm install -g gemini-relay
```

See [Getting Started](/getting-started) for full setup instructions.