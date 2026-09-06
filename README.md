<div align="center">
  <h1>Gemini Relay</h1>
  <p><strong>Hand the big reading to Gemini. Your agent gets the answer back, not the files.</strong></p>
</div>

<p align="center">
    <a href="https://github.com/V-Songbird/gemini-relay/stargazers"><img src="https://img.shields.io/github/stars/V-Songbird/gemini-relay?style=social" alt="GitHub stars"/></a>
    <a href="https://github.com/V-Songbird/gemini-relay/blob/main/LICENSE"><img src="https://img.shields.io/github/license/V-Songbird/gemini-relay" alt="License"/></a>
    <a href="https://docs.anthropic.com/en/docs/claude-code"><img src="https://img.shields.io/badge/Claude_Code-E5582B" alt="Claude Code"/></a>
</p>

<p align="center">
    <a href="#install"><strong>Install</strong></a> &nbsp;·&nbsp;
    <a href="#what-is-this">What is this?</a> &nbsp;·&nbsp;
    <a href="#why-youd-want-it">Why you'd want it</a> &nbsp;·&nbsp;
    <a href="#what-you-can-ask-for">What you can ask for</a> &nbsp;·&nbsp;
    <a href="#going-deeper">Going deeper</a>
</p>

> **TL;DR** — Your coding agent has a small context window, and reading a big folder fills it. Gemini Relay sends the reading to Google Gemini instead, and hands your agent back a short answer. Ask in plain English. Point at files with `@`, or let Gemini find them itself.

---

## What is this?

Your agent's context window is the thing you run out of first.

You ask it to review a folder. It opens twenty files, and now most of the window is source code it will never quote. The useful part of the answer is one paragraph, and there is no room left to act on it.

Gemini Relay is a small server that sits beside your agent. Your agent sends it a question, the question goes to Google Gemini, and only the answer comes back. The files never enter your agent's window.

Gemini can read the project on its own, too. Point it at files with `@` when you want exactly those. Say nothing and it goes looking.

## Why you'd want it

A real one, measured on this repo.

`package-lock.json` here is 181 KB. Reading it into an agent costs roughly 45,000 tokens, and then you still have to count the thing you wanted.

Sent through the relay instead, the whole file went to Gemini and this came back in 19 seconds:

> ```json
> { "count": 392 }
> ```

That is the entire cost to the agent. Nineteen seconds, one line, and the window is still empty for the work.

## Install

You need two things: this server, and Google's Antigravity CLI that it drives.

**1. Install the CLI and sign in.**

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy
```

Run `agy` once and it walks you through signing in. On Windows, use the official installer from <https://goo.gle/gemini-cli-migration> instead of the `curl` line.

**2. Add the server.**

Claude Code, one command:

```bash
claude mcp add gemini-relay -- npx -y gemini-relay
```

Claude Desktop, in `claude_desktop_config.json`:

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

Cursor and Windsurf: add a server named `gemini-relay` with the command `npx -y gemini-relay`.

**3. Check it.** Ask your agent to *run gemini-doctor*. It reports whether the CLI was found, whether you are signed in, and how much quota is left. It costs nothing to run.

Node 18.19 or newer.

## What you can ask for

Talk to your agent normally. These are the shapes that work.

| You want to… | Say something like |
| --- | --- |
| Review code without filling your window | *"Have gemini review `@src/backends` for race conditions."* |
| Look at something too big to open | *"Ask gemini what's in `@package-lock.json`."* |
| Let Gemini go find the problem itself | *"Ask gemini to find the riskiest code in this repo."* |
| Get a plan before you write anything | *"Use gemini-plan to design retry with backoff for the upload queue."* |
| Get a second opinion from another model | *"Ask gemini the same question, but with Claude Opus."* |
| Get an answer your code can parse | *"Ask gemini for the outdated deps as JSON."* |
| Make a picture | *"Use gemini-image for a 16:9 dark hero image, save it to `assets/hero.png`."* |
| Kick ideas around | *"Brainstorm ten ways to cut our cold-start time."* |
| See what models you have | *"Run gemini-models."* |
| Find out why it broke | *"Run gemini-doctor."* |

`@` accepts a file, a folder, `@.` for the whole project, or a glob like `@src/**/*.ts`.

<details>
<summary><strong>For AI agents — the full tool surface</strong></summary>

Nine tools. Every parameter, every default. A tenth, `timeout-test`, appears only when `GEMINI_MCP_TEST_TOOLS` is set.

| Tool | Parameter | Type · default | Notes |
| --- | --- | --- | --- |
| `ask-gemini` | `prompt` | string, required | Supports `@file`, `@dir`, `@.`, globs. |
| | `model` | string | Any id `gemini-models` lists, or `flash` / `pro`. Unset sends no `--model`, so agy answers on its own configured model. |
| | `effort` | `low` \| `medium` \| `high` | Thinking depth. |
| | `mode` | `plan` \| `accept-edits` | `plan` is read-only. |
| | `jsonSchema` | object \| string | Enforces structured JSON. Suppresses `includeUsage` and the conversation-id footer so the body stays parseable. |
| | `addDirs` | string[] | Extra directories agy may see. |
| | `conversationId` | string | Resume a thread. A plain reply reports the id it created or continued. |
| | `agent` | string | Run a custom `agent.md` agent. |
| | `allowSlashCommands` | boolean · `false` | Let a `/`-prefixed prompt reach agy's own command layer (`/usage`, `/skills`, …) — free, no model turn. Such a prompt is delivered on argv, because agy refuses a command under stdin. |
| | `skipPermissions` | boolean · `false` | `--dangerously-skip-permissions`. Headless runs honour persisted permissions since agy 1.1.5, so without this a disallowed tool call is refused with nobody to approve it. |
| | `includeUsage` | boolean · `false` | Appends tokens and timing. Ignored with `jsonSchema`. |
| | `sandbox` | boolean · `false` | Forwarded, but agy does **not** isolate tool execution headless, and says so in a notice. The legacy `gemini` backend does. |
| | `changeMode` | boolean · `false` | Gemini emits `**FILE: path:line**` over a fenced `OLD:` / `NEW:` block; you receive the parsed form — a `[CHANGEMODE OUTPUT …]` header, one `### Edit N` section per edit, and a `fetch-chunk` footer when chunked. |
| | `chunkIndex` | number \| string | Which chunk (1-based). With `chunkCacheKey` it replays a cached chunk; alone it picks a chunk of a fresh result. |
| | `chunkCacheKey` | string | Exactly 8 lowercase hex characters, or the call is refused. |
| `gemini-plan` | `task` | string, required | The thing to plan. |
| | `context` | string | Constraints, or `@file` references. |
| | `model` | string · `gemini-3.8-flash-high` | Pinned unless you override it. |
| | `effort` | `low` \| `medium` \| `high` · `high` | |
| | `addDirs` | string[] | |
| | `includeUsage` | boolean · `true` | Never reports a conversation id. |
| `gemini-image` | `prompt` | string, required | |
| | `aspectRatio` | enum · `1:1` | `1:1` `16:9` `9:16` `4:3` `3:4` `3:2` `2:3` `5:4` `4:5` `21:9` `4:1` `1:4` `8:1` `1:8`. |
| | `size` | `512` \| `1K` \| `2K` \| `4K` | Omit to let Gemini pick. |
| | `outputPath` | string | Relative workspace path. Escaping the root is refused. |
| `brainstorm` | `prompt` | string, required | |
| | `methodology` | `divergent` \| `convergent` \| `scamper` \| `design-thinking` \| `lateral` \| `auto` · `auto` | |
| | `model`, `effort`, `domain`, `constraints`, `existingContext` | string | |
| | `ideaCount` | integer · `12` | |
| | `includeAnalysis` | boolean · `true` | Never reports a conversation id. |
| `fetch-chunk` | `cacheKey`, `chunkIndex` | string, number — both required | Both reported by the initial `changeMode` reply. |
| `gemini-models` | — | | Live catalogue from `agy models`, plus backend capabilities. |
| `gemini-doctor` | — | | Binaries, versions, backend, plus login and quota via a free `agy -p "/usage"`. |
| `ping` | `prompt` | string · `""` | Answered in process. Proves the transport is alive, not the CLI. |
| `Help` | — | | The backend CLI's own `--help`. |

**One rule for every flag.** The relay sends a flag only when the installed `agy` advertised it in `--help`. If that probe finds nothing, no flags are sent at all and the run falls back to agy's defaults — an unknown flag makes agy exit non-zero and fails the whole request.

**Models.** Gemini 3.8 / 3.7 / 3.6 Flash in high, medium and low; Gemini 3.1 Pro in high and low; plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and `gpt-oss-120b-medium`, which draw on a **separate quota bucket**.

**What `@` actually sends.** A file inlines. A folder or `@.` inlines the text files beneath it. A glob inlines its matches. A token that resolves to nothing is left in the prompt verbatim. During folder and glob expansion `node_modules`, `.git`, `dist` and secret-looking files are skipped — name `@.env` directly and it *is* sent. Any file is dropped if it is binary, unreadable, or past the budget of 256 KB per file and 2 MB per prompt; a cut file carries `TRUNCATED:`, and dropped files are named in `OMITTED:` and `UNREADABLE:` footers. Nothing outside the project root is ever read.

| Variable | Default | What it does |
| --- | --- | --- |
| `GEMINI_MCP_BACKEND` | resolves by date | `agy` / `antigravity`, or `gemini` for the legacy CLI. Unset: `gemini` before 2026-06-18, `agy` from then on. |
| `AGY_CLI_PATH` | auto-detected | Full path to `agy`. Honoured on every platform. |
| `GEMINI_CLI_PATH` | auto-detected | Full path to the legacy `gemini`. **Windows only.** |
| `GEMINI_MCP_TIMEOUT` | `45` | Wrapper timeout in minutes. Fractions accepted. Read once at load. |
| `AGY_PRINT_TIMEOUT` | derived | Go duration forwarded to `agy --print-timeout`. Derived as 60 s under the wrapper above a two-minute wrapper, half of it at or below. |
| `AGY_MCP_PTY` | unset | `1` to recover `agy -p` stdout through a pseudo-terminal. POSIX only, recovery path only, own 10-minute cap. |
| `GEMINI_MCP_TEST_TOOLS` | unset | Registers the test-only `timeout-test` tool. |

</details>

## Going deeper

Everything technical lives here, so this page can stay short.

| | |
| --- | --- |
| [Agent guide](docs/AGENT_GUIDE.md) | Every tool schema, recipes, and how to spend a context window well |
| [How it works](docs/concepts/how-it-works.md) | What happens between your question and the answer |
| [Context inlining](docs/concepts/file-analysis.md) | What `@` sends, what it skips, and the budgets |
| [Models](docs/concepts/models.md) | The catalogue, reasoning effort, and the quota buckets |
| [Tool reference](docs/usage/commands.md) | Parameters and defaults, in long form |
| [Troubleshooting](docs/resources/troubleshooting.md) | The errors you will actually see, and what to do |
| [Antigravity CLI](docs/migration/antigravity-cli.md) | Why the backend moved, and what the code still guards against |

## Good to know

- **Gemini reads your project on its own.** Not only what you send with `@`. It has file, search, web, memory and shell tools, and it uses them in whatever folder the server runs in. `mode: "plan"` keeps a run read-only.
- **Headless runs are not sandboxed.** Asking for `sandbox` forwards the flag but does not isolate tool execution on the `agy` backend, and you get a notice saying so. Your own `agy` permission settings are what hold.
- **Secrets are skipped when a folder is expanded**, not when you name one. `@.env` sends the file.
- **Quota is shared with your other agy use.** `gemini-doctor` shows what is left, free of charge. Claude and GPT-OSS models sit on their own bucket.
- **Windows finds `agy` at `%LOCALAPPDATA%\agy\bin\agy.exe`.** If the server cannot see it, set `AGY_CLI_PATH` to the full path.
- **Nothing leaves your machine except the prompt.** Files are read locally and sent to Google as prompt text, the same as if you had pasted them.

## Working on it

```bash
npm run doctor    # is the environment sane
npm test          # 150 unit + integration tests
npm run test:e2e  # build, then drive the real CLI
npm run lint      # type-check source and tests
npm run build     # compile to dist/
```

## Support

If this saves you tokens or time, [buy me a coffee](https://ko-fi.com/victor_villegas).

## License

MIT — see [LICENSE](./LICENSE).
