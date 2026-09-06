# Migrating from Gemini CLI to Antigravity CLI (`agy`)

This page is a record of a migration that is over. The Antigravity CLI (`agy`) has been the
default backend since **2026-06-18**, and the problems described below were fixed upstream
months ago.

Read it if you maintain this code and want to know why the backend still carries a
capability probe and a four-rung output recovery ladder for a CLI that now answers cleanly
on the first rung. If you only want to use the relay, you want [Quick Start](/getting-started)
instead.

::: warning Written against `agy` 1.0.x — most of it has since been fixed upstream
`--output-format json` / `stream-json` and `--json-schema` landed in **1.1.8**, `--model`
and `--effort` stopped being ignored in headless runs in **1.1.10**, `--mode` started
working under `-p` in **1.1.12**, and `--input-format stream-json` arrived in **1.1.15**.
All of it verified live against **1.1.27** through this server. The 1.0.x behaviour is left
in place below, in the past tense, because it is the reason the code still carries a
capability probe (`src/backends/agyCapabilities.ts`) and a recovery ladder
(`agyBackend.run`) instead of assuming any one contract.
:::

## Why this exists

On 2026-06-18 Google retired the Gemini CLI for the free, Google AI Pro, and Google AI Ultra
tiers. After that date the `gemini` command stops serving those accounts — no grace period,
no warning at call time. Standard/Enterprise Code Assist licenses and paid Cloud API keys are
unaffected, but most of this project's users are on the tiers that lost access.

The relay is a thin wrapper that shells out to a CLI. When that binary stops answering, every
tool stops working on the same day. The official successor is the Antigravity CLI, invoked as
`agy`, and this is the plan that got the relay there without breaking anyone still on the old
CLI before the cutoff.

## What changed

`agy` is not a drop-in rename. It is a Go-based, agent-first CLI that shares a runtime with
the Antigravity desktop app, and the surface a non-interactive caller depends on differs in
ways that matter.

| Concern | Gemini CLI (legacy) | Antigravity CLI (`agy` 1.1.27) | Where it stands |
| --- | --- | --- | --- |
| Command | `gemini` | `agy` | One constant (`CLI.COMMANDS.AGY`) |
| One-shot prompt | `-p/--prompt`, prints to stdout | `-p/--print`. **1.0.x frequently exited 0 with empty stdout** in non-TTY/headless and Windows contexts; **fixed** by structured output in 1.1.8 | **Resolved** — stdout is the live path, the ladder stays as a fallback |
| Prompt delivery | argv | `--input-format stream-json` (1.1.15) — one NDJSON message on stdin | **Resolved on a build that advertises `--input-format`**: the prompt rides on stdin, with no command-line length ceiling. A build without it falls back to `-p <prompt>`, where the ceiling is real again and a large `@file` prompt used to die with `spawn ENAMETOOLONG` |
| Output format | `--output-format json` | `--output-format json` and `stream-json` (1.1.8) | **Resolved** — parsed in `agyOutput.ts` |
| Model select | `-m gemini-2.5-pro` etc. | `--model`; **ignored in headless 1.0.x** (and a non-active label hung the call), **fixed in 1.1.10** | **Resolved** — exposed as `model`. There is no relay-wide default; leave it unset and no `--model` is sent (§2) |
| Reasoning effort | n/a | `--effort low\|medium\|high`, fixed alongside `--model` in 1.1.10 | New capability, exposed as `effort` |
| Execution mode | `--approval-mode {default,auto_edit,yolo,plan}` | `--mode accept-edits\|plan`; **ignored under `-p` until 1.1.12** | **Resolved** — `gemini-plan` runs `--mode plan` |
| Structured output | `--output-format json` | `--json-schema <schema>` (1.1.8) | Exposed as `jsonSchema` |
| `@file` inlining | CLI inlines `@path` file contents into the prompt | Not offered; the agent reads files via its own tools | **Unchanged** — the relay inlines the files itself (§3) |
| Sandbox | `-s/--sandbox` | `--sandbox` exists and is forwarded, but the relay does not claim it isolates tool execution in `-p` | Honest notice, not a guarantee (§4) |
| Approval modes | `--approval-mode {default,auto_edit,yolo,plan}` | only `--dangerously-skip-permissions` — **no longer a no-op**: since 1.1.5 headless runs honour the persisted permission settings | Exposed as `skipPermissions` |
| Slash commands | n/a | a prompt starting with `/` expands as an agy command or skill (`/usage`, `/skills`, …) instead of reaching the model | `--disable-slash-commands` by default; opt back in with `allowSlashCommands: true` |
| Sessions | `--session-id <id>`, `--resume` | `--conversation <id>`, `--continue` (continue is **global**, not per-workspace) | Explicit ids preferred; `ask-gemini` reports the `conversationId` (§5) |
| Auth | gemini OAuth / API key | OS credential store; run `agy` once interactively to sign in | `gemini-doctor` verifies it (§6) |
| Transcript on disk | n/a (stdout is the source of truth) | JSONL transcripts under `~/.gemini/antigravity-cli/brain/...` (dual-writing `.db`) | Last-resort fallback only |

**One rule for every optional flag.** `buildAgyArgs` takes a required capability set from
`probeAgyCapabilities()` and sends a flag only when the installed `agy` advertised it in
`--help`. There is no permissive tier and no exception. When `agy --help` is missing, times
out or cannot be parsed the probe returns `NO_AGY_CAPABILITIES` and no flags are sent at all:
the run is a bare `agy -p <prompt>` on agy's own defaults, rather than an unknown flag that
would make `agy` exit non-zero and fail the whole request. The gated flags are listed in the
block at the foot of this page.

`--continue` is the one entry above the relay never passes on any build. It is probed, but
explicit `--conversation` ids are always preferred (§5).

The headline, as it stood in 1.0.x: the relay assumes a clean, synchronous "prompt in →
answer on stdout" CLI, and `agy` did not provide that. Most of the work below was recovering
that contract on top of an agent-first tool. Since 1.1.8 the contract exists for real, and the
recovery machinery has demoted itself to a fallback — which is what it was built to do.

---

## Deep dive: where the two CLIs diverged

### 1. The output contract was broken (`agy -p` empty stdout) — fixed in 1.1.8

`executeCommand()` is built around the child process writing its answer to stdout. In `agy`
1.0.x — at least in the non-TTY/headless contexts an MCP server runs in, and reported on
Windows — `agy -p` authenticated, talked to the model, got the answer back, and then exited 0
without printing it. To the relay that looked like "success, empty answer".

The workaround was to stop trusting stdout and read `agy`'s own transcript off disk, the same
path PR #78's experimental backend takes. The layout it reads is in the block at the foot of
this page. It worked, but it was a reverse-engineered private contract, and it carried three
risks:

| Risk | Why |
| --- | --- |
| Format | 1.0.5 already dual-writes a SQLite `.db` beside the JSONL, so the reader probes both. The SQLite path needs `node:sqlite` (Node 22.5+) and reports its own runtime error when that is missing; the package's Node floor stays `>=18.19.0` |
| Discovery | `last_conversations.json` is keyed by project directory. A change to the schema, the key normalization or the directory layout makes discovery fail silently |
| Concurrency | Each run rewrites `last_conversations.json`, so two concurrent runs read each other's ids back. All `agy` calls are serialized behind one promise queue to avoid this — correct, but it costs parallelism |

| ID | Proposed, and where it landed |
| --- | --- |
| **S1** | **Landed.** The transcript path is a fallback: stdout wins whenever it is non-empty, so now that `agy -p` prints reliably the scrape never runs |
| **S1b** | **Landed as opt-in, now vestigial.** `AGY_MCP_PTY=1` drives `agy -p` under a pseudo-terminal so a TTY-only build streams to a pipe the relay can capture, reading none of `agy`'s internal files. With 1.1.8+ nothing reaches this rung |
| **S2** | **Landed.** `agyTranscript.ts` detects JSONL vs SQLite by what exists on disk and reads either behind one `readTranscriptResponse()` interface |
| **S3** | Proposed: accept only transcript entries newer than the process start time. **Landed.** Discovery is start-time-bounded, so a stale answer from a previous run can never be returned when discovery races |
| **S4** | Proposed: ask upstream to emit and accept a conversation id for headless callers. **Obsolete.** Nothing needs to come from upstream: `agy`'s JSON result carries `conversation_id`, and `ask-gemini` reports the id of the thread it created or continued — omitted under `jsonSchema` and `changeMode`, where the body must stay parseable. `gemini-plan` and `brainstorm` do not surface it. See [antigravity-cli#7](https://github.com/google-antigravity/antigravity-cli/issues/7) |

### 2. Model selection was gone in print mode — fixed in 1.1.10

In `agy` 1.0.x, print mode was pinned to one Flash model: `--model` existed for the
interactive TUI but was ignored under `-p`, and passing a non-active model label made the call
hang past 60s (verified on 1.0.5). Reasoning effort had the same problem. Since **1.1.10** both
flags work in headless runs.

A live `agy models` call returns Gemini 3.8 / 3.7 / 3.6 Flash in high, medium and low,
Gemini 3.1 Pro in high and low, and `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and
`gpt-oss-120b-medium`. Those last three bill against a **separate quota bucket** from the
Gemini ones, so exhausting Gemini's weekly allowance does not lock you out of them. The relay
also accepts the aliases `flash` and `pro` (`normalizeAgyModel`). The full catalogue is on
[Models](/concepts/models).

There is no relay-wide default: `gemini-plan` pins `gemini-3.8-flash-high` and `gemini-image`
hardcodes it, while `ask-gemini` and `brainstorm` send no `--model` at all unless you name one,
leaving the choice to agy's own configuration.

| ID | Proposed, and where it landed |
| --- | --- |
| **S5** | **Landed, then relaxed.** Model support is a backend capability rather than a global assumption (`supportsModelSelection` on the `Backend` interface). `agyBackend` sets it `true`; `runWithBackend` still emits a notice on any backend that sets it `false`, so a dropped `model` is never silent |
| **S6** | Proposed: stop passing `--model` to `agy -p` until upstream fixed the hang, behind a capability gate that could light it up again later without a code change. **Superseded.** `--model` is passed to `agy -p` again, gated on the capability probe exactly as the gate was designed to allow |
| **S7** | Proposed: document the Pro-versus-Flash cost and latency delta in `docs/concepts/models.md`. **Partly moot.** The Pro→Flash quota fallback (`RESOURCE_EXHAUSTED` → retry on Flash) and the `gemini-2.5-*` model names both exist **only on the legacy `gemini` backend**. On `agy` there is no such fallback; a quota error surfaces as `agy`'s own text |

### 3. `@file` inlining does not exist in `agy`

A user writes `@src/huge.ts explain this` and expects the file contents in the prompt. The
Gemini CLI inlined them itself. `agy` is agent-first: the agent decides to read files with its
own tools during a multi-step run, which is non-deterministic and puts the path guard outside
the data path.

The relay does the inlining itself. That is unchanged.

- `inlineFileReferences()` resolves each `@token`: a file inside the project root is inlined, a
  directory (including `@.`) expands to the text files under it, a glob expands to its matches,
  and a token that resolves to nothing is left in the prompt verbatim.
- The `node_modules` / `.git` / `dist` and secret-file skip lists apply to expansion only. A
  file you name directly is not filtered out for being a secret — `@.env` is inlined and its
  contents do go to Gemini, which is the user's own choice. It can still be dropped for being
  binary, unreadable or over budget. [Context inlining](/concepts/file-analysis) has the
  budgets and the footers.
- changeMode rewrites `file:foo` → `@foo` first (`prepareChangeModePrompt`), so both backends
  produce the same prompt body and both go through the same guard.
- The inlined prompt rides to `agy` on stdin when the installed build advertises
  `--input-format`, so its size is bounded by those budgets rather than by the OS argv limit.
  Without that flag it goes back into `-p <prompt>` and the argv limit applies again.

| ID | Proposed, and where it landed |
| --- | --- |
| **S8** | **Landed.** `buildAgyPrompt()` → `inlineFileReferences()`: the relay reads the referenced files, so the output reflects exactly the files named |
| **S9** | **Landed.** `assertSafeFileReferences()` is a hard gate on the input prompt on every backend, and realpath-checks in-root symlinks (CVE-2026-0755) |
| **S10** | **Landed.** The `@file`-on-`agy` regression is covered by tests |

### 4. Security posture: sandbox and approvals

- `--sandbox` exists and the relay forwards it when asked, but the backend declares
  `sandboxIsolatesToolExecution: false` — print-mode tool execution runs with the user's
  privileges. Asking for `sandbox: true` therefore also produces the notice *"Backend "agy"
  does not isolate tool execution in headless mode; the sandbox request cannot be
  guaranteed."* That is deliberately the weakest honest claim. Upstream has been adding
  sandbox restrictions since 1.1.10, but the relay does not assert an isolation property the
  code has not verified.
- There are no graded approval modes, only `--dangerously-skip-permissions`. It is **no longer
  a no-op**: since 1.1.5 headless runs honour the persisted permission settings, so without the
  flag a tool call those settings disallow is simply refused, with nobody there to approve it.
  `ask-gemini`'s `skipPermissions: true` maps to it.

| ID | Proposed, and where it landed |
| --- | --- |
| **S11** | **Landed.** A guarantee the backend cannot honour produces a notice rather than silence |
| **S12** | Proposed: make `agy`-backed tools read-only from the relay's side, since explaining and summarising files needs no tool execution at all, and prefer a planner-only print mode if `agy` ever exposed one. **Landed.** `--mode plan` is a real read-only planner mode; `gemini-plan` uses it, and `ask-gemini` accepts `mode: "plan"` |
| **S13** | **Landed.** The `@file` project-root guard (S9) remains the one sandbox property the relay enforces itself, on the input side |

### 5. Sessions and concurrency

`--session-id` / `--resume` (gemini) map to `--conversation` / `--continue` (agy). One gap
remains: `agy --continue` resumes the most recent conversation **globally**, not per-workspace,
so concurrent callers in different repos can resume each other's threads.

| ID | Proposed, and where it landed |
| --- | --- |
| **S14** | **Landed.** The relay prefers explicit `--conversation <id>` and never relies on `--continue`'s global "most recent" semantics |
| **S15** | **Landed differently.** No relay-generated UUID is needed: `agy`'s JSON result carries `conversation_id`, which `ask-gemini` returns to the caller to pass back as `conversationId` (except under `jsonSchema` / `changeMode`, per S4) |
| **S16** | **Landed.** `agy` calls stay serialized behind one promise queue, so a second concurrent tool call waits for the first — the fix for the concurrency risk in §1 |

### 6. Packaging, auth, and detection

`agy` is a Go binary installed to `~/.local/bin/` (POSIX) or
`%LOCALAPPDATA%\agy\bin\agy.exe` (Windows; older builds used `%LOCALAPPDATA%\Antigravity\`),
not an npm global. The gemini-era Windows PATH-resolution logic would not have found it. Auth
is the OS credential store after running `agy` once interactively, and the old
`buildEnoentErrorMessage` hard-coded an npm install command for the retired CLI.

| ID | Proposed, and where it landed |
| --- | --- |
| **S17** | Proposed: generalise executable resolution so it also finds `agy` — its known install directories plus an `AGY_CLI_PATH` override, mirroring `GEMINI_CLI_PATH`. **Landed.** Executable resolution honours `AGY_CLI_PATH` first, then probes the known install locations and `where`/PATH |
| **S18** | **Landed.** `buildEnoentErrorMessage` is backend-aware: an `agy` user gets the Antigravity install pointer and "run `agy` once to sign in", not an npm command |
| **S19** | **Landed, and went further.** `gemini-doctor` detects both CLIs, reports versions and paths, and checks login and quota by running `agy -p "/usage" --output-format json` — answered by agy's command layer without an agent turn, so it costs no tokens |

---

## Migration phases

**Phase 0 — Backend seam. Done.**
Pluggable backends under `src/backends/` (`Backend` interface + `getBackend()` +
`runWithBackend()`), selected with `GEMINI_MCP_BACKEND`. Capability flags
(`supportsModelSelection`, `supportsReasoningEffort`, `supportsStructuredOutput`,
`supportsModes`, `sandboxIsolatesToolExecution`) describe each CLI honestly.

**Phase 1 — Make `agy` honest. Done.**
- Capability gating in `runWithBackend`: anything a backend cannot honour produces a notice
  instead of a silent downgrade (S5/S11). On today's `agy` the model, effort, mode and schema
  gates all pass; only the sandbox notice still fires.
- `@file` is handled per backend: `inlineFileReferences()` reads the referenced files for
  `agy`, keeping determinism **and** the CVE-2026-0755 project-root guard in the data path
  (S8/S9).
- Detection is backend-aware: `AGY_CLI_PATH` override, known-install-dir/`where` resolution,
  and `agy`-correct ENOENT guidance (S17/S18).

**Phase 2 — Harden the recovery path. Done.**
- `agyTranscript.ts` reads JSONL **and** detects/reads the dual-written SQLite `.db` behind one
  `readTranscriptResponse()` interface (S2).
- Discovery is start-time-bounded (`newestConversationSince`) so a stale reply is never returned,
  and explicit `--conversation` ids are read back deterministically (S3/S14).

**Phase 3 — Converge on stdout; self-retire the scrape. Done, and self-retired as upstream improved.**

Output recovery is a capability-aware ladder in `agyBackend.run`, ordered best to last resort.
On `agy` 1.1.27 every run lands on rung 1.

| Rung | What it is | When it runs |
| --- | --- | --- |
| 1. Structured stdout | On a 1.1.15+ build the prompt goes out as `--input-format stream-json` and the reply comes back as `--output-format stream-json`; on a 1.1.8-to-1.1.14 build it falls back to `-p <prompt> --output-format json`. Either way `parseAgyJsonResponse` reads the answer, the conversation id, the status, any error and the usage off stdout. No transcript touched | Whenever `probeAgyCapabilities()` — one `agy --help` read per process — finds the flags |
| 2. Plain stdout | The raw stdout text | Whenever it is non-empty, so a build with no structured output still answers |
| 3. PTY recovery | Runs `agy` under a pseudo-terminal so a TTY-only build still streams real stdout, with **no** private files read (S1b) | Opt-in, `AGY_MCP_PTY=1`, POSIX only. Gated on `!viaStdin`, so on a build that takes the prompt on stdin it is never reached — the prompt is not in the args then |
| 4. Transcript scrape | The Phase 2 last resort | Only when every rung above produced nothing |

Because rung 1 is driven by `agy --help`, the backend climbed the ladder on its own as upstream
fixed print-mode. No code change was needed.

Hardening:
- **stdin routing** — the whole prompt rides on stdin as one `--input-format stream-json`
  message, so inlined `@file` and changeMode prompts are not bounded by the OS argv limit.
  Builds without `--input-format` fall back to `-p`.
- **Error-tolerant ladder** — a non-zero exit from `agy -p` descends the ladder instead of
  aborting the run; only "not installed" aborts immediately. `agy`'s own verdict (invalid
  model, exhausted quota, dropped login) is parsed off its JSON stdout and surfaced
  **verbatim**, instead of the old `Command failed with exit code 1: Unknown error`.
- **Bounded runs** — `executeCommand` has a 45-minute default timeout (`GEMINI_MCP_TIMEOUT`, in
  minutes), and `agy --print-timeout` is derived to expire strictly first so `agy` can report
  its own timeout with a usable message.
- **Symlink guard everywhere** — `assertSafeFileReferences` realpath-checks in-root symlinks,
  closing the CVE-2026-0755 hole on the gemini path too.

**Phase 4 — Date-aware cutover. Done.**
`resolveDefaultBackend()` in `src/backends/index.ts` returns `gemini` before **2026-06-18** and
`agy` from then on — because once gemini is retired, `agy` is the only live option, so the
default flipped automatically with no release required on the day. `GEMINI_MCP_BACKEND` always
overrides. `backendSelection()` surfaces a one-time notice on the post-retirement
auto-switch, and, in the 14 days before the cutover (`RETIREMENT.WARN_WITHIN_DAYS`), a
one-time nudge to test `agy` early. Both are suppressed when `GEMINI_MCP_BACKEND` is set
explicitly. Standard/Enterprise/API-key users who retain `gemini` access just set
`GEMINI_MCP_BACKEND=gemini`.

<details>
<summary><strong>For AI agents — gated flags, JSON fields, transcript layout, environment</strong></summary>

**The gated flags.** `buildAgyArgs` gates `--model`, `--effort`, `--json-schema`, `--mode`,
`--add-dir`, `--conversation`, `--sandbox`, `--agent`, `--disable-slash-commands` and
`--dangerously-skip-permissions`; `--input-format`, `--output-format` and `--print-timeout` are
decided the same way in `agyBackend.run`. One rule for all of them, stated above. `--continue`
is probed and never passed.

**agy's JSON result** (`--output-format json` / `stream-json`, 1.1.8+) carries
`conversation_id`, `status`, `response`, `error`, `usage` and `structured_output`.
`parseAgyJsonResponse` in `agyOutput.ts` reads them.

**The stdin message** is one NDJSON line:
`{"event":"user","message":{"role":"user","content":…}}`. The argv ceiling it avoids is 32,767
characters on Windows.

**Transcript layout** (rung 4, read by `agyTranscript.ts`):

1. Map the current working directory to a conversation id via
   `~/.gemini/antigravity-cli/cache/last_conversations.json`.
2. Read the JSONL transcript at
   `~/.gemini/antigravity-cli/brain/<conv-id>/.system_generated/logs/transcript.jsonl`.
3. Take the entries after the last `USER_INPUT` where
   `source = MODEL, type = PLANNER_RESPONSE, status = DONE` and join their `content`.

The id preference order is an explicit `--conversation` id, then the cwd→id map, then the
newest recently-written conversation (`newestConversationSince`). The dual-written SQLite `.db`
sits either beside the JSONL in the logs dir or under
`~/.gemini/antigravity-cli/conversations/<id>.db`; the reader probes both and needs
`node:sqlite` (Node 22.5+).

**PTY recovery** (rung 3) runs `agy` under `script(1)`, POSIX only. Args are POSIX
single-quoted (`shSingleQuote`) before they are handed to `script(1)`, so the non-PTY path's
injection safety is preserved. It carries its own 10-minute cap (`PTY_TIMEOUT_MS` in `agyOutput.ts`), unaffected by `GEMINI_MCP_TIMEOUT` and by
`--print-timeout`; on expiry it `SIGKILL`s the whole `script(1)` process group and returns only
what it had captured.

| Variable | Purpose |
| --- | --- |
| `GEMINI_MCP_BACKEND` | `gemini` or `agy`/`antigravity`; unset uses the date-aware default, which is `agy` since 2026-06-18 (Phase 4) |
| `AGY_CLI_PATH` | Full path to the `agy` binary when it isn't on the server's PATH. Honoured on every platform |
| `GEMINI_CLI_PATH` | **Windows only** — full path to the legacy `gemini` binary, for `GEMINI_MCP_BACKEND=gemini`. `resolveGemini` returns the bare command before it ever reads the override on any other platform, so the variable is inert off Windows |
| `AGY_MCP_PTY` | `1` to enable opt-in PTY stdout recovery for `agy -p` (POSIX only, rung 3) |
| `GEMINI_MCP_TIMEOUT` | Overall CLI run timeout in minutes (default 45); `agy`'s `--print-timeout` derives from it |
| `AGY_PRINT_TIMEOUT` | Override `agy`'s `--print-timeout` directly (Go duration, e.g. `30m`) |

</details>

## Still open

1. Will `agy` be open source (gemini-cli is Apache-2.0)? That affects how long the transcript
   reader is worth keeping as a fallback versus deleting outright.
2. Can `--continue` be scoped per workspace, or must callers always carry an explicit
   `conversationId`?

## Sources

- [Google Developers Blog — Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [google-gemini/gemini-cli Discussion #27274 — official transition announcement](https://github.com/google-gemini/gemini-cli/discussions/27274)
- [google-antigravity/antigravity-cli Issue #7 — conversation ids for headless callers](https://github.com/google-antigravity/antigravity-cli/issues/7)
- [Antigravity CLI usage docs](https://antigravity.google/docs/cli-using)
- This repo: [PR #78 (v1.2.0)](https://github.com/V-Songbird/gemini-relay/pull/78) ·
  [Discussion #90](https://github.com/V-Songbird/gemini-relay/discussions/90)
