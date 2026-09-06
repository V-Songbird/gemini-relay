# Installation

Two pieces are involved: the **MCP server** (`gemini-relay`, an npm package) and the **engine it drives** (the Antigravity CLI, `agy`, installed separately and signed in once). The relay does not talk to Google directly — it shells out to `agy` in print mode.

[Quick Start](/getting-started) is the short path: install `agy`, sign in, add the server, check it. This page is the rest: the clients that need more than one command, what to do when the server cannot find `agy`, and every variable it reads.

## Add the server to your client

Claude Code takes one command, and it is in [Quick Start](/getting-started).

**Claude Desktop.** Add this to `claude_desktop_config.json`, then restart the app:

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

The file lives at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows, and `~/.config/claude/claude_desktop_config.json` on Linux.

**Cursor and Windsurf.** In the editor's MCP / Agent settings, add a server named `gemini-relay`, of type `command`, with the command `npx -y gemini-relay`.

**Global install.** If you would rather not go through `npx` every time:

```bash
npm install -g gemini-relay
```

::: warning Do not install `@google/gemini-cli` for this
The legacy Gemini CLI is a different program. It stopped serving free, Pro and Ultra tiers on 2026-06-18, which is why the relay defaults to `agy`. Install it only if you are on an enterprise/commercial license or a paid API key and intend to set `GEMINI_MCP_BACKEND=gemini`.
:::

## When the server cannot find `agy`

The MCP server runs in its own process and often does not inherit your interactive `PATH`. So `where agy` / `which agy` works in your shell, and `gemini-doctor` still reports the binary as not found.

Point the server straight at it with `AGY_CLI_PATH`:

```json
{
  "mcpServers": {
    "gemini-relay": {
      "command": "npx",
      "args": ["-y", "gemini-relay"],
      "env": {
        "AGY_CLI_PATH": "C:\\Users\\you\\AppData\\Local\\agy\\bin\\agy.exe"
      }
    }
  }
}
```

The binary is at `%LOCALAPPDATA%\agy\bin\agy.exe` on Windows (older builds used `%LOCALAPPDATA%\Antigravity\`), and in `~/.local/bin` on macOS and Linux.

## Environment variables

The server needs no configuration. `AGY_CLI_PATH` above is the one most people ever set; `GEMINI_MCP_TIMEOUT`, in minutes, is the other, if a long job keeps hitting the 45-minute wall.

<details>
<summary><strong>For AI agents — every variable the server reads</strong></summary>

The first six configure normal operation and live in `src/constants.ts`. The seventh is read in `src/tools/index.ts`.

| Variable | Effect |
| :--- | :--- |
| `GEMINI_MCP_BACKEND` | Active CLI backend: `agy`/`antigravity` or `gemini`. Unset, the default is `agy` (since 2026-06-18). |
| `AGY_CLI_PATH` | Full path to the `agy` executable, skipping the PATH lookup and install-location probes. Honoured on **every** platform — it is the first thing `resolveAgy` reads. |
| `GEMINI_CLI_PATH` | Full path to the legacy `gemini` executable, used by the `gemini` backend. **Windows only** — `resolveGemini` returns the bare command before it ever reads the override on macOS and Linux, where `gemini` comes from `PATH`. |
| `GEMINI_MCP_TIMEOUT` | CLI run timeout in **minutes**. Default `45`. |
| `AGY_PRINT_TIMEOUT` | Overrides the `--print-timeout` value passed to `agy` (e.g. `30m`). Otherwise it is derived from the run timeout above. |
| `AGY_MCP_PTY` | Opt-in: recover `agy -p` stdout through a pseudo-terminal. POSIX only. |
| `GEMINI_MCP_TEST_TOOLS` | Registers the test-only `timeout-test` tool, so the server exposes ten tools instead of nine. Set it only when running the test suite. |

</details>

Next: your first calls, in [First Steps](/first-steps).
