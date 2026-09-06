# CLAUDE.md — working on gemini-relay

This file is for changing this repo.

If you are here to *call* the relay instead, the tool surface is in [README.md](README.md), under
the collapsed "For AI agents" table, and in full in [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md) —
schemas, defaults, recipes, models, environment variables. Do not restate either of them here.

`gemini-relay` is an MCP server. A coding agent sends it a question, the question goes to Google
Gemini through the Antigravity CLI (`agy`), and only the answer comes back. TypeScript over stdio,
nine tools, compiled to `dist/`.

## Commands

```bash
npm run doctor            # environment and CLI detection
npm run lint              # type-check source and tests (tsc -p tsconfig.test.json)
npm run build             # compile to dist/
npm test                  # unit + integration suites
npm run test:unit         # one suite
npm run test:integration  # one suite
npm run test:e2e          # builds first, then drives the real CLI
```

Node.js >= 18.19.0 (`package.json` `engines`); CI runs 18.x, 20.x and 22.x. The optional SQLite
transcript fallback in `src/backends/agyTranscript.ts` needs `node:sqlite` (22.5+), but it is a
last-resort path and does not raise the floor.

## Constraints

Five things here are load-bearing. Breaking one is a regression, not a refactor.

**Backend selection.** `GEMINI_MCP_BACKEND` picks the backend. Unset, it resolves by date: the
legacy `gemini` CLI before the 2026-06-18 Gemini CLI retirement, `agy` (Antigravity CLI) on or
after it. There is no hardcoded default.

**Spawning on Windows.** A direct `.exe` binary (`agy.exe`) must be spawned with `shell: false`, so
`cmd.exe` never re-parses the argument line and cannot corrupt a multiline prompt.

**Prompt delivery.** When the installed `agy` advertises `--input-format`, the prompt is written to
stdin as one `stream-json` NDJSON message and no argv length ceiling applies to it. Otherwise the
backend falls back to `-p <prompt>` — with `--output-format json` when that is advertised, plain
text when it is not — and the OS argv cap applies again. One exception: agy refuses to answer a
slash command under `stream-json`, so a prompt that `allowSlashCommands` lets expand is delivered
on argv.

**Flag gating.** One rule, no exceptions: a flag is sent only when the installed `agy` advertised it
in `--help`. If the probe finds nothing, no flags at all are sent and the run falls back to agy's
own defaults — an unknown flag makes agy exit non-zero and fails the whole request. The flag list
and the probe's caching are in [the agent guide](docs/AGENT_GUIDE.md).

**File reference security.** Every `@file` reference must be validated by
`assertSafeFileReferences()` (CVE-2026-0755). Resolved paths, symlink targets included, must stay
strictly inside the project root directory.
