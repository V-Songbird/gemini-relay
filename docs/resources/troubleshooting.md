# Troubleshooting

Find the line you saw. Every error quoted on this page is the literal text, so you can paste
what is on your screen straight into search.

Start by asking your agent to run `gemini-doctor`. It costs nothing, and it answers most of
this page on its own: whether the CLI was found, which backend is active, whether you are
signed in, and how much quota is left.

## "Could not find the agy executable"

What you see:

```text
Could not find the "agy" executable.
The MCP server runs in its own process and may not inherit your shell's PATH.
• Verify it is installed and resolvable: `where agy`.
• Antigravity CLI (agy) is the Gemini CLI's successor and this tool's default backend
  since 2026-06-18. To install it, install it from https://goo.gle/gemini-cli-migration,
  then run `agy` once to sign in.
• It installs to %LOCALAPPDATA%\agy\bin\agy.exe (older builds: %LOCALAPPDATA%\Antigravity\);
  add that directory to PATH or set AGY_CLI_PATH to the full path of agy.exe.
• On a supported Gemini tier (paid API key or Enterprise/Standard license)? Set
  GEMINI_MCP_BACKEND=gemini to keep using the Gemini CLI instead.
• More: https://goo.gle/gemini-cli-migration and docs/migration/antigravity-cli.md
```

Your MCP client starts the server as a child process, and that process usually does not
inherit the PATH your shell has. So `agy` runs fine when you type it and vanishes under the
server.

First check the binary is really there:

```bash
agy --version
```

If it runs in your shell, pin the full path so PATH stops mattering:

```bash
# Windows
setx AGY_CLI_PATH "%LOCALAPPDATA%\agy\bin\agy.exe"
# macOS / Linux
export AGY_CLI_PATH="$HOME/.local/bin/agy"
```

Or set it on the server entry itself, which works however the client was launched:

```json
{
  "mcpServers": {
    "gemini-relay": {
      "command": "npx",
      "args": ["-y", "gemini-relay"],
      "env": { "AGY_CLI_PATH": "C:\\Users\\you\\AppData\\Local\\agy\\bin\\agy.exe" }
    }
  }
}
```

Windows installs agy to `%LOCALAPPDATA%\agy\bin\agy.exe`. macOS and Linux install it to
`~/.local/bin/agy`, a directory a GUI-launched MCP client very often does not have on PATH.
Restart the terminal and the MCP client after installing Node.js or agy, so PATH changes are
picked up.

## `error: unknown option '-y'` on Windows

Registering the server from Claude Code on Windows can reject the `-y` flag. Use one of these
instead:

```bash
# Install globally first
npm install -g gemini-relay
claude mcp add gemini-relay -- gemini-relay

# Use --yes instead of -y
claude mcp add gemini-relay -- npx --yes gemini-relay

# Drop the flag entirely
claude mcp add gemini-relay -- npx gemini-relay
```

## "MCP server not responding" or "MCP error -32000: Connection closed"

The client cannot start or reach the server. Check four things, in order.

1. **Node and the config file.** `node --version` must report **18.19.0** or higher. Your config
   file must be valid JSON and in the place your client looks for it — the paths are on
   [Installation](/installation).

2. **Restart the client completely.** Quit it (Cmd+Q on macOS), wait a few seconds, reopen.

3. **Read the client's logs** for the `[GMCPT]` lines the server writes to stderr.
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`

4. **Reinstall, if the binary itself is broken.**

   ```bash
   npm uninstall -g gemini-relay
   npm install -g gemini-relay
   claude mcp list
   ```

## "Login check failed", or it worked yesterday and every call fails today

Run `gemini-doctor`. It runs `agy -p "/usage" --output-format json`, which agy answers from
its own command layer without starting an agent turn — no tokens spent, no conversation left
behind.

A healthy run ends with:

```text
🎉 **System Ready!** The modern Antigravity CLI backend is active, signed in, and operational.
```

Anything else, and the report names which:

| Line in the report | What it means | What to do |
| :--- | :--- | :--- |
| `❌ Login check failed — most likely signed out, offline, or out of quota.` | `/usage` did not return at all. | Run `agy` once interactively and finish the sign-in. |
| `` ❌ `/usage` reported status `ERROR` — most likely signed out. `` | agy answered, but not as a signed-in account. | Run `agy` once interactively. |
| `❌ Every quota bucket is exhausted — model calls will fail until one resets.` | Login is fine. You are rate-limited. | Wait for the reset time, or switch models. |
| `` ⚠️ `/usage` returned output this tool could not parse `` | Usually agy printing a self-update notice ahead of its JSON. | Re-run it. |
| `` ⚠️ Skipped: `agy` was not found `` | The server cannot see the CLI. | See the first section on this page. |

You can check quota yourself, free of charge:

```bash
agy -p "/usage" --output-format json
```

Buckets report a `remaining_fraction` and a `reset_time`. The Gemini models and the Claude /
GPT-OSS models sit in **separate quota buckets**, so spending one leaves the other working —
switching `model` to `claude-sonnet-4-6` is a real way out of a spent Gemini bucket. The
catalogue is on [Supported Models](/concepts/models).

## "agy produced no output"

```text
agy produced no output for <cwd> (no stdout, stderr, or transcript).
Run `agy -p "hi"` directly to check for an expired login or exhausted quota.
```

The run reached agy and agy said nothing at all. Do what the message says and run
`agy -p "hi"` yourself — it is nearly always an expired login or a spent quota bucket. When
agy is alive but unable to answer, the relay surfaces agy's own wording instead of this.

## "invalid model selection"

The backend forwards agy's verdict verbatim, and that verdict names the models agy will
actually serve:

```text
invalid model selection … Available models: …
```

Ask for the live list rather than guessing — run the `gemini-models` tool, or:

```bash
agy --output-format json models
```

The full catalogue and the two aliases are on [Supported Models](/concepts/models).

`gemini-2.5-pro` and `gemini-2.5-flash` are **legacy Gemini CLI** names. They only reach a
real model when you have deliberately set `GEMINI_MCP_BACKEND=gemini`; on the default agy
backend they are rewritten to the 3.x equivalents.

## "agy timed out after 2700s"

The run outlived its deadline and the wrapper had to SIGKILL the child, so there is no partial
answer to return. You will see your own number in place of `2700s`.

`GEMINI_MCP_TIMEOUT` is in **minutes** and defaults to **45**. Raise it on the server entry:

```json
{
  "mcpServers": {
    "gemini-relay": {
      "command": "npx",
      "args": ["-y", "gemini-relay"],
      "env": { "GEMINI_MCP_TIMEOUT": "90" }
    }
  }
}
```

It is read once, when the server process starts, so restart your MCP client afterwards.

**Your MCP client has its own timeout, usually far shorter than 45 minutes.** The server sends
a progress notification every 25 seconds to keep that connection alive, but a client with a
hard cap still gives up on its own schedule.

**A second call that looks hung may only be queued.** Every agy run is serialized behind one
queue, because each run rewrites agy's conversation cache.

## Files went missing from a big `@` prompt

The inline budget dropped them, and it always says so in the prompt:

```text
----- TRUNCATED: src/big.ts is 900000 bytes, only the first 262144 are shown -----

----- OMITTED: the 2097152 byte inline budget was reached; 340 file(s) not included:
      a.ts, b.ts, …, and 330 more -----

----- UNREADABLE: files exist but could not be read; 2 file(s) not included: x.ts, y.ts -----
```

256 KB per file, 2 MB per prompt. Narrow the reference rather than trying to raise anything:
`@src/backends` instead of `@.`, or a glob such as `@src/**/*.ts`. What `@` sends and what it
skips is on [Context Inlining](/concepts/file-analysis).

## `spawn ENAMETOOLONG`

Shorten the `@` reference, or update agy. Your agy build is putting the prompt in argv rather
than on stdin, and it hit the operating system's command-line ceiling. `gemini-doctor` reports
the agy version it found.

## A `@token` came back as plain text

That is intentional. A token is inlined only when it resolves to something that exists, so
`@Injectable()` or a misspelled path survives into the prompt untouched rather than being
replaced by a "file not found" marker. If you expected a file, check the spelling and the
working directory — references resolve against the project root the server was started in. What
each kind of token resolves to is on [Context Inlining](/concepts/file-analysis).

## A `@` reference to an image or PDF was ignored

Binary files are dropped, and this is the one drop nothing announces. A NUL byte in the first
8 KB is enough, wherever the file came from, including a file you named yourself. So `@logo.png`
reaches the model as prose, with no `UNREADABLE:` or `OMITTED:` footer to say otherwise.

## "Refusing @file reference outside the project directory"

What you see, one of:

```text
Refusing @file reference outside the project directory: "@../secrets.txt".
Only files within <project root> may be referenced.

Refusing @file reference resolving outside the project directory: "@link-to-elsewhere".
Only files within <project root> may be referenced.
```

The first is the lexical check; the second fires when an in-root path is a **symlink** whose
real target lies outside the root. `~` is rejected outright. There is no opt-out —
[Context Inlining](/concepts/file-analysis) explains why.

Use a path relative to the project root with no `..` segments. If the content genuinely
lives elsewhere, add that directory to the run instead:

```json
{ "name": "ask-gemini", "arguments": {
    "prompt": "@src/index.ts compare against the shared library",
    "addDirs": ["../shared-lib"] } }
```

## A `/usage` prompt came back as a chatty model answer

agy treats a prompt beginning with `/` as one of its own commands or skills. Those answer for
free, with no model turn — but it also means an ordinary prompt that happens to start with a
slash would never reach the model. So `ask-gemini` sends `--disable-slash-commands` by default
and your text goes to the model verbatim.

To reach the commands on purpose:

```json
{ "name": "ask-gemini", "arguments": {
    "prompt": "/usage",
    "allowSlashCommands": true } }
```

The free, zero-token commands include `/usage`, `/skills`, `/help`, `/agents`, `/model`,
`/effort`, `/permissions`, `/hooks`, `/changelog`, `/config` and `/credits`. On an agy build
that does not advertise `--disable-slash-commands`, a `/` prompt may still expand regardless of
this setting.

## `sandbox: true` returned a warning instead of isolation

```text
⚠️ Backend "agy" does not isolate tool execution in headless mode; the sandbox request cannot be guaranteed.
```

That warning is the honest answer. `sandbox: true` does forward `--sandbox` to agy, but agy's
print mode runs the full agent with your own privileges under the permission rules in its
settings file, so the relay will not promise isolation it does not provide. The legacy `gemini`
backend is the one that reports real sandbox isolation.

If what you want is look-but-do-not-touch, use `mode: "plan"` or the `gemini-plan` tool, which
is read-only by construction. The whole picture is on [Sandbox Mode](/concepts/sandbox).

## A config change did nothing

1. Save the config file.
2. Quit the MCP client completely — not just the window.
3. Reopen it and run `gemini-doctor`. Its header names the active backend and whether it came
   from `GEMINI_MCP_BACKEND` or the `auto-default`.

Capability detection (`agy --help`) is cached for the life of the server process, so if agy
self-updates underneath a long-running server, restart the client to pick up the new flags.

## Still stuck

1. Run `gemini-doctor` and keep its output.
2. Search [GitHub Issues](https://github.com/V-Songbird/gemini-relay/issues).
3. Open a new issue with the doctor report, the exact error text, your OS, and
   `node --version`.

<details>
<summary><strong>For AI agents — resolution order, environment, timeouts, logs</strong></summary>

**How the relay looks for `agy`**, in order:

1. `AGY_CLI_PATH`, if set — used verbatim.
2. On Windows: `where agy`, preferring a `.exe` over a `.cmd`/`.bat`.
3. On Windows, if `where` finds nothing, these locations are probed directly:
   `%LOCALAPPDATA%\agy\bin\agy.exe`, `%LOCALAPPDATA%\Antigravity\agy.exe`,
   `%LOCALAPPDATA%\Programs\agy\agy.exe`, `%USERPROFILE%\.local\bin\agy.exe`.
4. On macOS/Linux: `~/.local/bin/agy`, then plain PATH lookup.

**One rule for every flag.** The relay sends a flag only when the installed `agy` advertised it
in `--help`. If that probe fails, times out (4 s) or cannot be parsed, every capability is
false and **no flags at all** are sent: the run falls back to agy's own defaults, because an
unknown flag makes agy exit non-zero and fails the whole request.

**How the prompt is delivered**, decided the same way. On a build that advertises
`--input-format`, the prompt goes on stdin as one stream-json message and no length limit
applies. Otherwise it rides in argv under the OS ceiling, which is what produces
`spawn ENAMETOOLONG` — and a build whose probe failed or timed out counts as otherwise, because
every capability then defaults to false.

**Environment variables.**

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `GEMINI_MCP_BACKEND` | resolves by date | `agy`/`antigravity`, or `gemini` for the legacy CLI. Unset uses the date-based default: `gemini` before 2026-06-18, `agy` from then on. |
| `AGY_CLI_PATH` | auto-detected | Full path to the `agy` executable, bypassing PATH lookup. Honoured on **every** platform. |
| `GEMINI_CLI_PATH` | auto-detected | Full path to the legacy `gemini` executable. **Windows only** — the resolver returns the bare command before reading it on macOS/Linux, where `gemini` comes from PATH, so the override is inert there. |
| `GEMINI_MCP_TIMEOUT` | `45` | Wrapper run timeout in **minutes**. Any finite value greater than zero is accepted, fractions included — `0.5` is a 30-second cap, useful for testing the timeout path. Only a non-numeric or non-positive value falls back to the default. Read once, when the server process starts. |
| `AGY_PRINT_TIMEOUT` | derived | Overrides agy's own `--print-timeout` with a Go duration string (e.g. `30m`). Derived otherwise to sit strictly below the wrapper deadline: one minute less when the total is over 120 s, half of it at or below. |
| `AGY_MCP_PTY` | unset | `1` opts into the POSIX-only recovery path — re-run agy under a pseudo-terminal when print mode yields nothing. Carries its own independent **10-minute** cap, after which the whole process group is SIGKILLed; raising `GEMINI_MCP_TIMEOUT` does not extend it. |
| `GEMINI_MCP_TEST_TOOLS` | unset | Registers the test-only `timeout-test` tool, so the server exposes ten instead of nine. |
| `NODE_ENV` | unset | `test` mutes routine log lines. |

There is no API-key variable: `agy` authenticates through its own interactive login.

**Log lines.** The server writes diagnostics to stderr prefixed `[GMCPT]`, and your MCP client
collects them. There is no debug flag to turn on; error-level lines are always emitted.

The argv handed to agy is recorded as its *shape*. Only flag tokens survive; every value is
replaced by its length, including short ones like the effort:

```text
[GMCPT] [1757030000000] Starting: agy --model <21 chars> --effort <4 chars>
```

The tool call's own arguments are shaped by a narrower rule — every dispatch logs the tool name
and each argument, with a **string** value replaced by its length and every other value
(boolean, number, `addDirs`, a `jsonSchema` object) printed as its JSON in full:

```text
[GMCPT] Tool ask-gemini(prompt=<47 chars> model=<19 chars> changeMode=true)
```

So neither the prompt you typed nor the files it expanded to reach `%APPDATA%\Claude\logs\`
(or `~/Library/Logs/Claude/`). No argv is retained between calls either, so a run that timed
out or failed to spawn leaves nothing behind.

**Windows spawning.** `agy.exe` is spawned directly with `shell: false`, which avoids
`cmd.exe`'s argument re-parsing entirely. A `.cmd`/`.bat` shim cannot be spawned that way and
goes through the shell, where every argument is quoted to survive re-parsing — so prefer
pointing `AGY_CLI_PATH` at the real `.exe`. That is not what removes the length ceiling:
on a build without `--input-format` the prompt still rides in argv, capped at 32,767
characters.

</details>
