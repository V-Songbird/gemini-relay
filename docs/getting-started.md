# Getting Started with Gemini Relay

Connect your AI assistants (**Claude Code**, Claude Desktop, Cursor, Windsurf, and custom orchestrators) directly to **Google Gemini 3.8 Flash** and **Gemini 3.1 Pro** via Google's modern **Antigravity CLI** (`agy`).

---

## 📋 Prerequisites

Before setting up `gemini-relay`, ensure you have:

1. **[Node.js](https://nodejs.org/)** (v18.0.0 or higher recommended).
2. **Google Antigravity CLI (`agy`)** installed and authenticated:
   - **macOS / Linux**:
     ```bash
     curl -fsSL https://antigravity.google/cli/install.sh | bash
     ```
   - **Windows**: Download and install via the official installer or run `agy` in your terminal to complete one-time interactive login.
3. *(Optional)* **Gemini CLI** (`gemini.cmd` / `gemini`) if you are on an enterprise/commercial license.

---

## ⚡ Client Setup

### 1. Claude Code (Recommended)

Claude Code provides the smoothest integration. Add the MCP server with one command:

```bash
claude mcp add gemini-relay -- npx -y gemini-relay
```

*(On Windows PowerShell, use `claude mcp add gemini-relay -- npx -- y gemini-relay` if prompted).*

#### Verify Active Tools
Inside Claude Code, run:
```bash
/mcp
```
You should see all 9 active tools registered: `ask-gemini`, `gemini-plan`, `gemini-image`, `gemini-models`, `gemini-doctor`, `brainstorm`, `fetch-chunk`, `ping`, and `Help`.

---

### 2. Claude Desktop

Add `gemini-relay` to your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

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

Restart Claude Desktop after saving the configuration.

---

### 3. Cursor & Windsurf

In your editor's MCP / Agent Settings:
- **Server Name**: `gemini-relay`
- **Server Type**: `command`
- **Command**: `npx -y gemini-relay`

---

## 🧪 Verifying Environment Health

To verify that your CLI binaries, Node environment, and active backend are in working order, run the diagnostic doctor:

```bash
npm run doctor
```

Or ask your AI assistant directly:
> *"Run gemini-doctor to check the MCP server and CLI health"*