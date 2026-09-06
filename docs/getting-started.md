# Quick Start

Two things to install: Google's Antigravity CLI (`agy`), and this server, which drives it. Then one check that tells you both worked.

Node 18.19 or newer.

## 1. Install the CLI and sign in

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy
```

On Windows, use the official installer from <https://goo.gle/gemini-cli-migration> instead of the `curl` line.

Running `agy` on its own walks you through signing in. That happens once, and it is interactive. The relay never signs in for you.

## 2. Add the server

Claude Code, one command:

```bash
claude mcp add gemini-relay -- npx -y gemini-relay
```

Claude Desktop, Cursor, Windsurf and a global npm install are in [Installation](/installation).

Then run `/mcp` inside Claude Code. Nine tools should be listed: `ask-gemini`, `gemini-plan`, `gemini-image`, `gemini-models`, `gemini-doctor`, `brainstorm`, `fetch-chunk`, `ping` and `Help`.

## 3. Check it worked

Ask your agent:

> *"Run gemini-doctor"*

It reports whether the CLI was found, whether you are signed in, and how much quota is left. It costs nothing to run. A healthy report ends with:

```
🎉 **System Ready!** The modern Antigravity CLI backend is active, signed in, and operational.
```

From a clone of this repository, `npm run doctor` runs the same check from the terminal.

If it says `agy` was not found even though your own shell finds it, the server did not inherit your `PATH` — see [when the server cannot find `agy`](/installation#when-the-server-cannot-find-agy). If the login check fails, run `agy` once interactively to sign in.

<details>
<summary><strong>For AI agents — the exact checks and floors</strong></summary>

| | |
| --- | --- |
| Node floor | `18.19.0`, declared in `package.json` engines. CI runs 18.x, 20.x and 22.x. |
| Tool count | Nine. A tenth, `timeout-test`, is registered only when `GEMINI_MCP_TEST_TOOLS` is set — see [environment variables](/installation#environment-variables). |
| `gemini-doctor` reports | The active backend and where that choice came from; the resolved `agy` and `gemini` executables and their versions; and — when `agy` is the active backend and was found — login and quota. |
| How it reads quota | By running `agy -p "/usage" --output-format json`. Agy's own command layer answers that without an agent turn, so it costs no tokens. |
| `npm run doctor` | The same diagnostic, run from a clone of the repository rather than through MCP. |

</details>

## Next

Run your first calls in [First Steps](/first-steps).
