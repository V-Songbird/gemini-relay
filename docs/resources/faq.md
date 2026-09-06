# Frequently Asked Questions

Short answers. When the full one lives on another page, the link is there.

## General

### What is Gemini Relay?

An MCP server. Your agent sends it a question, it runs the Antigravity CLI (`agy`) in print
mode, and only the answer comes back — the files never enter your agent's context window. It
exposes nine tools: `ask-gemini`, `gemini-plan`, `gemini-image`, `gemini-models`,
`gemini-doctor`, `brainstorm`, `fetch-chunk`, `ping` and `Help`. They are all on the
[tool reference](/usage/commands).

### Why use this instead of running the CLI myself?

- You stay inside your agent's workflow, with no context switching.
- The bulk reading happens in Gemini's context, not your agent's.
- `@file` references are inlined and jailed to the project root before the prompt leaves.
- Two model families can look at the same code from one client.

### Is it free?

The server is open source and free. You need an authenticated `agy` install — run `agy` once
to sign in — and any MCP client.

### Does it work offline?

No. `agy` reaches Google's models over the network.

### Does it support Windows?

Yes. Point `AGY_CLI_PATH` at the real `agy.exe` rather than a `.cmd`/`.bat` shim and it is
spawned directly, with no `cmd.exe` in between to re-parse the arguments. If the server cannot
find the binary at all, see [Troubleshooting](/resources/troubleshooting).

## Setup

### Do I need to install a CLI separately?

Yes, the Antigravity CLI. On macOS and Linux:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

On Windows, install it from <https://goo.gle/gemini-cli-migration>. Either way, run `agy` once
afterwards and complete the sign-in, then check it with `agy --version`. The rest of the setup —
every client, and what to do when the server cannot find the binary — is on
[Installation](/installation).

Do **not** install `@google/gemini-cli` for this. That is the legacy backend, and it stopped
serving free, Pro and Ultra tiers on 2026-06-18.

### What Node.js version do I need?

Node **18.19.0** or higher (`engines` in `package.json`). One optional last-resort
transcript-recovery path uses `node:sqlite` and therefore wants Node 22.5+, but it degrades with
its own message rather than raising the floor.

### Which backend am I on?

Run `gemini-doctor`. Its header reads:

```text
- Active Backend: **`AGY`** (via `auto-default`)
```

`auto-default` means nothing was set and the date-based default applied — that has been `agy`
since 2026-06-18. `via GEMINI_MCP_BACKEND` means something set it explicitly. Set
`GEMINI_MCP_BACKEND=gemini` to select the legacy Gemini CLI instead (Enterprise/Standard
license or a paid API key), or `agy` to pin the modern one. The two are not equivalent — the
legacy backend forwards far fewer parameters, listed in the block at the foot of this page.

## Using it

### What is the `@` syntax?

It is how you pull files into the prompt:

- `@file.js` — one file
- `@src` — every text file under a directory
- `@.` — the whole project
- `@src/**/*.ts` — a glob (`*`, `**` and `?` only)

A token that resolves to nothing is left in the prompt verbatim, so `@param` and `@types/node`
pass through untouched. The skips, the budgets and the project-root jail are all on
[Context Inlining](/concepts/file-analysis).

### Can I send the whole project?

Yes — `@.` expands it. What bounds the result is the 2 MB inline budget, not a length limit,
and anything it drops is named in the prompt. If you get `spawn ENAMETOOLONG` instead, your agy
build is putting the prompt in argv rather than on stdin; see
[Troubleshooting](/resources/troubleshooting).

### Which model should I use?

`gemini-3.8-flash-high` (alias `flash`) for most work, `gemini-3.1-pro-high` (alias `pro`) for
audits and architecture, a `-medium` or `-low` variant — or a lower `effort` — for cheaper
turns. Ask the live backend with the `gemini-models` tool rather than trusting any written
list. The catalogue is on [Supported Models](/concepts/models).

### Can I use Claude or GPT-OSS models through this?

Yes. `agy` also serves `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and
`gpt-oss-120b-medium`. Pass one as `model` like any other id:

```json
{ "name": "ask-gemini", "arguments": {
    "prompt": "Second judge: @src/utils/commandExecutor.ts safe on Windows?",
    "model": "claude-opus-4-6-thinking", "mode": "plan" } }
```

They bill against a **separate quota bucket** from the Gemini models — see
[Supported Models](/concepts/models).

### Why does a reply end with a conversationId?

Because every agy run belongs to a conversation, and you need its id to continue the thread:

```text
🧵 conversationId: a4d4c538-… (pass it back to continue this thread)
```

Pass that value back as `conversationId` and agy resumes the same session with its history —
which costs more per turn than a fresh one, since the history is replayed. `ask-gemini` is the
only tool that reports an id: `gemini-plan` and `brainstorm` never do, and neither takes the
parameter. It is also omitted when `changeMode` is on or a `jsonSchema` is set, because those
bodies are parsed.

### Why did my slash prompt not work?

`ask-gemini` sends `--disable-slash-commands` by default, so a prompt starting with `/` goes to
the model verbatim instead of expanding into an agy command. Set `allowSlashCommands: true` to
reach the free, zero-token commands. [Troubleshooting](/resources/troubleshooting) lists them,
and the one build caveat.

### Can it generate images?

Yes, with `gemini-image`, which drives agy's `generate_image` tool. It takes a `prompt`, one of
fourteen aspect ratios, an optional `size` (`512`, `1K`, `2K` or `4K`) and an optional
`outputPath` inside your workspace. There is deliberately no image-model parameter — see the
[tool reference](/usage/commands).

### What does changeMode give me back?

A rendered edit list, not the raw markers Gemini was asked to emit: a `[CHANGEMODE OUTPUT …]`
header, one `### Edit N: <filename>` section per edit, then a footer. Large sets are chunked,
and a chunked reply prints the exact `fetch-chunk` call to make next. Both shapes, both failure
paths and the chunk parameters are on the [tool reference](/usage/commands).

### Why is it slow?

- Every print-mode turn re-sends the system prompt, skills and workspace context.
- Higher `effort` buys more thinking tokens, and pays for them in time.
- Runs are serialized: a second call waits for the first, because each run rewrites agy's
  conversation cache.
- A run is capped by `GEMINI_MCP_TIMEOUT` — minutes, default 45.

### Can I point it at my own model or endpoint?

No. Only what the active backend serves; run `gemini-models` for the live list.

## Privacy and security

### Is my code sent to Google?

Whatever you reference reaches Google's models. Note also that agy runs a full agent on your
machine: beyond the files the relay inlines, the agent can read files and run commands itself
under the permissions in its own settings. Treat an `ask-gemini` call as running an agent, not
as sending a message.

### Is anything sandboxed?

Not on the agy backend; headless runs are not isolated. Use `mode: "plan"` or the `gemini-plan`
tool for read-only work. [Sandbox Mode](/concepts/sandbox) covers what does protect you.

### Are credentials safe?

The relay never reads, stores or forwards credentials; sign-in lives entirely in `agy`. During
directory and glob expansion it also skips secret-looking files, so a single `@.` cannot sweep
them into a prompt. Naming one directly, as `@.env`, does send its contents to Gemini — the
relay treats an explicit reference as your own decision.

### Can I use this for proprietary code?

Check your organization's policies, and Google's terms for the CLI you are authenticated
against.

### Can I run this in CI?

It is built for interactive development. Nothing stops a headless run, but permission prompts
have nobody to answer them: a tool call your agy settings do not allow is refused.
`skipPermissions: true` is the only override, and it reaches agy only on a build that
advertises `--dangerously-skip-permissions`.

<details>
<summary><strong>For AI agents — legacy backend, argv ceilings, changeMode labels</strong></summary>

**The legacy `gemini` backend forwards less.** Under `GEMINI_MCP_BACKEND=gemini`:

| Parameter | What happens |
| :--- | :--- |
| `model`, `sandbox`, `changeMode` | Forwarded. |
| `effort`, `mode`, `jsonSchema` | Dropped, and the reply carries a `⚠️` notice saying so. |
| `addDirs`, `conversationId`, `agent`, `allowSlashCommands`, `skipPermissions`, `includeUsage` | Silently ignored. |

**Argv ceilings**, which apply only when the prompt rides in argv rather than on stdin: a
direct `agy.exe` spawn gets the OS cap of 32,767 characters, while a `.cmd`/`.bat` shim goes
through `cmd.exe` and its much lower 8,191-character line limit. Which path the prompt takes is
in [Troubleshooting](/resources/troubleshooting).

**changeMode labels**, for anything matching on the response text. The header is
`[CHANGEMODE OUTPUT - Gemini has analyzed the files and provided these edits]`, or
`[CHANGEMODE OUTPUT - Chunk 1 of 3]` when the set was split. The footer is
`Apply these edits in order.` Do not anchor on the first line: when more than five edits were
parsed, a `ChangeMode Summary:` block — total edits, files affected, a per-file count — is
prefixed to the first chunk, ahead of the header.

</details>

## More questions

- [Documentation home](/)
- [Antigravity migration guide](/migration/antigravity-cli)
- [GitHub Issues](https://github.com/V-Songbird/gemini-relay/issues)
- [Discussions](https://github.com/V-Songbird/gemini-relay/discussions)
