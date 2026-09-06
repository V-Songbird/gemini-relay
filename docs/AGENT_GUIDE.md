# Gemini Relay — Agent Guide

This is for the thing making the calls — a coding agent, an orchestrator, or you while you wire one
up. It holds the nine tool schemas as the caller sees them, what comes back in each response mode,
what an `@` token expands to, eight worked recipes, the model catalogue and the environment
variables.

Start at the [README](https://github.com/V-Songbird/gemini-relay#readme) for what the server is for
and how to install it. The flat list of parameters and defaults is the
[Tool reference](./usage/commands.md). Come here when a call did something you did not expect, or
when you need what those two leave out — which flags the installed `agy` build will even accept,
what happens on the parse-failure and out-of-budget paths, and how to get a partial answer back in
chunks.

---

## 1. What the server is for

`gemini-relay` runs your prompt through Google's **Antigravity CLI** (`agy`) — or the legacy
`gemini` CLI — and hands back the text. Four things it buys you:

1. **Your context window stays empty.** Point at files with `@file` or `@.` instead of reading them
   yourself; Gemini reads the bytes and you get the finding. When the installed agy advertises
   `--input-format`, the assembled prompt reaches it on stdin as a single `stream-json` message, so
   there is no command-line length ceiling on how much you inline — only the server's own byte
   budgets (§4). An older build, or one whose `agy --help` probe timed out, falls back to
   `-p <prompt>` and is still bounded by the OS argv cap.
2. **A second model.** `effort: "high"` on `ask-gemini` or `gemini-plan` to check an algorithm, a
   race condition or a design before you write it — and the non-Gemini models in §5 for a
   cross-vendor read on a separate quota bucket.
3. **Parseable output.** A `jsonSchema` constrains the reply to your shape (§2 for how it arrives).
4. **Applicable edits.** `changeMode: true` returns exact-match replacements, parsed and validated,
   chunked when large (Recipe 4).

---

## 2. Complete Tool Catalog & Schemas

### Tool 1: `ask-gemini`
**Category:** General Analysis, Reasoning & Code Edits  
**What it does:** Query Gemini (3.8 / 3.7 / 3.6 Flash, 3.1 Pro) — or the Claude and GPT-OSS models agy also offers (§5) — for analysis, reasoning, planning and code changes, with `@path` file inlining, reasoning effort controls, agent execution modes, and optional structured JSON schema enforcement.

#### Input Schema:
```typescript
{
  prompt: string;           // Required: Analysis request. Supports "@file.ts" syntax to inline local files.
  model?: string;           // Optional: Model identifier or alias. No default — leave it unset
                            //           and no --model is sent, so agy answers on the model it is
                            //           itself configured for. See §5.
  effort?: "low" | "medium" | "high"; // Optional: Thinking token depth (Gemini 3.8 Flash, 3.7 Flash, 3.1 Pro).
                                      //           'high' for security, concurrency, algorithms and architecture;
                                      //           'low' for summaries, syntax conversion and classification.
  mode?: "accept-edits" | "plan";     // Optional: 'plan' for read-only analysis; 'accept-edits' for direct edit application.
  jsonSchema?: string | object;       // Optional: Enforce structured JSON conforming to this schema.
  addDirs?: string[];                 // Optional: Directories added to the workspace context.
  conversationId?: string;            // Optional: Resume a previous session. A plain-text reply reports the id it
                                      //           created or continued; a jsonSchema or changeMode reply does not,
                                      //           because its body is parsed.
  agent?: string;                     // Optional: Name of a custom agent.md agent to run instead of the default.
                                      //           Ignored by an agy build whose --help does not advertise --agent —
                                      //           the same gate every flag passes (§6).
  allowSlashCommands?: boolean;       // Optional (default false): Let a prompt starting with '/' expand as an agy
                                      //           command or skill ('/usage', '/skills') instead of reaching the model.
                                      //           Such a prompt is delivered on argv, because agy refuses to answer
                                      //           a command under stream-json (§6).
  skipPermissions?: boolean;          // Optional (default false): Run agy with --dangerously-skip-permissions,
                                      //           on a build whose --help advertises it (§6).
  includeUsage?: boolean;             // Optional (default false): Append token counts and timing metrics.
                                      //           Ignored when jsonSchema is set, so the body stays valid JSON.
  sandbox?: boolean;                  // Optional (default false): Forward --sandbox (see the note below).
  changeMode?: boolean;               // Optional (default false): Ask for machine-applicable edits and get them back
                                      //           parsed and re-rendered (see the Return Format below).
  chunkIndex?: number | string;       // Optional: which chunk of a changeMode response to return (1-based). With
                                      //           chunkCacheKey it reads the cached chunk; alone, it selects which
                                      //           chunk of a freshly computed changeMode result comes back.
  chunkCacheKey?: string;             // Optional: cache key for multi-chunk retrieval. Exactly 8 lowercase hex
                                      //           characters, or the call is refused.
}
```

#### Return Format:
- Normal mode: Plain markdown text prefixed with `Gemini response:\n`, followed — when the run reported a thread id — by a `🧵 conversationId: <id>` line you can pass back as `conversationId`.
- Structured output (`jsonSchema`): the JSON payload, with no `🧵 conversationId` line appended — but still behind the `Gemini response:` prefix, and behind any `⚠️` notice lines. Strip those leading lines before `JSON.parse()`. The notices you see in ordinary use are the once-per-process backend-migration notice, which is suppressed by setting `GEMINI_MCP_BACKEND` explicitly; the sandbox notice, which only fires when you pass `sandbox: true`; and, from the run itself, a notice naming any tool actions agy's persisted permission settings refused, or any non-SUCCESS status agy reported.
- Change mode (`changeMode: true`): a `[CHANGEMODE OUTPUT …]` header, then one `### Edit N: <filename>` section per edit with a "Replace this exact text:" block and a "With this text:" block, then a footer — carrying `fetch-chunk` continuation instructions when the response was chunked. The `**FILE:**`/`OLD:`/`NEW:` shape is what Gemini is asked to emit, not what you receive (Recipe 4).
- A capability the active *backend* cannot honour — model selection, reasoning effort, mode, JSON schema, sandbox isolation — is reported as a `⚠️` notice line prepended to the response. A flag the installed agy build does not advertise is dropped silently instead (§6), so the notice list is not a complete record of what was applied.

> **On `sandbox`:** the flag is forwarded to `agy --sandbox`, but the agy backend declares `sandboxIsolatesToolExecution: false` (print mode runs tools with your own privileges), so the response also carries a notice that the sandbox request cannot be guaranteed. The legacy `gemini` backend does isolate. Use `mode: "plan"` when you need a genuinely read-only run on agy.

---

### Tool 2: `gemini-plan`
**Category:** Architecture & Implementation Blueprints  
**What it does:** Plans a feature or a refactor and changes nothing. The run is pinned to `mode: "plan"`, and the prompt asks for phased implementation steps, the dependencies between them, the edge cases and the risks.

#### Input Schema:
```typescript
{
  task: string;                       // Required: Feature, refactor, or architectural problem to plan.
  context?: string;                   // Optional: Requirements, constraints, or reference files (supports @file).
  model?: string;                     // Optional: Unset, this tool pins 'gemini-3.8-flash-high'
                                      //           (unlike ask-gemini, which sends no --model at all). See §5.
  effort?: "low" | "medium" | "high"; // Optional (default 'high'): Deep thinking token allocation.
  addDirs?: string[];                 // Optional: Workspace directories for project context.
  includeUsage?: boolean;             // Optional (default true): Append thinking/token metrics.
}
```

There is no `conversationId` here, in either direction: `gemini-plan` reads only the text and the notices off the run, so no `🧵 conversationId` line comes back and a plan cannot be resumed as a thread. Ask the follow-up through `ask-gemini`, which does report one.

#### When Claude Code / Agents Should Use `gemini-plan`:
- Before starting any multi-file feature or breaking refactor.
- When designing database schemas, state management architectures, or API contracts.
- When an agent is unsure of the optimal sequencing of code changes.

---

### Tool 3: `gemini-models`
**Category:** Introspection & Discovery  
**What it does:** Lists available Gemini models, default selections, reasoning capabilities, and active backend status.

#### Input Schema:
```typescript
{} // No arguments required
```

#### Output Information:
- Active Backend name (`AGY` or `GEMINI`).
- Default model identifier.
- Model selection status (`✅ Supported`).
- Reasoning effort support status (`✅ Supported ('low', 'medium', 'high')`).
- Structured output support status (`✅ Supported`).
- Agent mode support status (`✅ Supported`).
- Tool sandbox status (`⚠️ Host-executed in headless` on the agy backend).
- Full list of available model IDs and labels, read live from `agy models`; if that call fails the tool falls back to a built-in list of the Gemini 3.8 / 3.7 / 3.1 ids, which does not include the non-Gemini models (§5).

---

### Tool 4: `gemini-doctor`
**Category:** Diagnostics & Health Check  
**What it does:** Verifies CLI installation paths (`agy.exe` and `gemini.cmd`), versions, active backend selection, Node runtime, OS environment — and, when agy is the active backend, login and quota.

#### Input Schema:
```typescript
{} // No arguments required
```

#### Login & Quota Check:
The report ends with a **Login & Quota** section built from `agy -p "/usage" --output-format json`. That command is answered by agy's command layer without starting an agent turn, so it costs zero tokens and leaves no conversation behind. Each quota bucket is listed with its remaining percentage and reset time; a signed-out account, an unparseable payload or a fully exhausted bucket downgrades the final verdict from **System Ready** to **Action needed**.

#### When to Use:
- When a tool call returns an unexpected execution failure.
- During initial session preflight to verify that the environment is fully operational.
- Before a long batch of calls, to see how much quota is left.

---

### Tool 5: `brainstorm`
**Category:** Ideation & Exploration  
**What it does:** Generates ideas against a challenge you state, through one of five ideation frameworks — SCAMPER, Design Thinking, Lateral, Divergent or Convergent — or `auto` to let it pick. Domain, constraints and prior attempts feed in; feasibility and impact ratings come back. Reasoning effort applies.

#### Input Schema:
```typescript
{
  prompt: string;           // Required: Core challenge or topic to explore.
  model?: string;           // Optional: Like ask-gemini, no default — unset, no --model is
                            //           sent. See §5.
  effort?: "low" | "medium" | "high"; // Optional: Reasoning effort.
  methodology?: "divergent" | "convergent" | "scamper" | "design-thinking" | "lateral" | "auto"; // Default 'auto'
  domain?: string;          // Optional: e.g. 'software', 'security', 'marketing', 'creative'.
  constraints?: string;     // Optional: Constraints, budget, latency limits, tech stack.
  existingContext?: string; // Optional: Previous attempts or current state.
  ideaCount?: number;       // Optional (default 12): Number of ideas to generate. Integer, greater than zero.
  includeAnalysis?: boolean;// Optional (default true): Feasibility and impact ratings.
}
```

Like `gemini-plan`, `brainstorm` reports no `🧵 conversationId` line and takes no `conversationId`, so a round of ideas cannot be continued as a thread.

### Tool 6: `gemini-image`
**Category:** Multimodal Asset Generation  
**What it does:** Generates an image from a text description by asking the run to use the Antigravity CLI's own image generation tool. Supports aspect ratio and output size selection, plus optional export of the result into your project workspace.

#### Input Schema:
```typescript
{
  prompt: string;         // Required: Detailed visual description of the image to create.
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3"
              | "5:4" | "4:5" | "21:9" | "4:1" | "1:4" | "8:1" | "1:8"; // Optional (default '1:1')
  size?: "512" | "1K" | "2K" | "4K";  // Optional: output resolution. Omit to let Gemini pick.
  outputPath?: string;    // Optional: Relative project workspace file path (e.g. 'assets/hero.jpg').
}
```

> **No image-model parameter, deliberately.** `aspectRatio` and `size` are written into the prompt text, never into `--model`: that flag selects the planner model and rejects image model ids. The generated file is located under agy's conversation `brain` directory and, when `outputPath` is given, copied to that path — which is jailed to the project root the same way `@file` references are.

---

### Tool 7: `fetch-chunk`
**Category:** Pagination & Diff Retrieval  
**What it does:** Fetches a specific chunk of multi-file edit suggestions generated during a `changeMode` call that exceeded chunk size thresholds.

#### Input Schema:
```typescript
{
  cacheKey: string;   // Required: 8-character lowercase hex key returned by ask-gemini.
  chunkIndex: number; // Required: 1-based chunk index to retrieve.
}
```

Chunks are cut at roughly 20,000 characters and cached on disk for **10 minutes** (`gemini-mcp-chunks` under the OS temp directory). Past the TTL, or after a machine reboot clears temp, re-run the original `changeMode` request rather than fetching a stale key.

---

### Tools 8 & 9: `ping` and `Help`
- `ping`: Returns the `prompt` string (or `Pong!` when none is given) to verify the server is alive. It answers in-process — no subprocess is spawned — so it proves the MCP transport works, not that the CLI does, and it times nothing. `prompt` (default `""`) is its only parameter; the zod schema strips every other key, so an argument like `message` never arrives. Use `gemini-doctor` to check the CLI.
- `Help`: Retrieves the active backend's official CLI command line help manual (`agy --help`).

---

## 3. High-Value Agent Workflows & Recipes

### Recipe 1: Context-Saving Codebase Audit
**Problem:** Claude Code has a limited context window. Loading 20 large TypeScript files consumes 80,000+ tokens.
**Solution:** Ask Gemini to inspect them all and return only the findings.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Audit @src/backends/agy.ts @src/utils/commandExecutor.ts @src/constants.ts for concurrency safety, unhandled promise rejections, and process leaks. Return a concise bulleted list of high-severity risks.",
    "model": "gemini-3.8-flash-high",
    "effort": "high"
  }
}
```

### Recipe 2: Phased Implementation Blueprint with `gemini-plan`
**Problem:** You are tasked with adding a complex feature (e.g. WebSocket streaming with exponential backoff and auth token rotation) and need a verified architectural plan before touching code.
**Solution:** Call `gemini-plan`.

```json
{
  "name": "gemini-plan",
  "arguments": {
    "task": "Add resilient WebSocket reconnection with exponential backoff and automatic token refresh",
    "context": "Must integrate with existing @src/utils/logger.ts and adhere to zero external dependencies.",
    "effort": "high"
  }
}
```
*Claude Code can then follow the returned phased plan step-by-step, executing and verifying each phase independently.*

### Recipe 3: Enforcing Machine-Readable JSON Output
**Problem:** You want Gemini to classify errors or produce an AST analysis that your code can parse directly without parsing conversational markdown.
**Solution:** Provide `jsonSchema`.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Analyze @package.json and list all outdated or vulnerable dependencies with recommended target versions.",
    "jsonSchema": {
      "type": "object",
      "properties": {
        "vulnerabilities": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "package": { "type": "string" },
              "currentVersion": { "type": "string" },
              "recommendedVersion": { "type": "string" },
              "severity": { "type": "string", "enum": ["low", "medium", "high", "critical"] }
            },
            "required": ["package", "currentVersion", "recommendedVersion", "severity"]
          }
        }
      },
      "required": ["vulnerabilities"]
    }
  }
}
```
*The reply is not bare JSON. It comes back as `Gemini response:\n{…}`, with any `⚠️` notice lines ahead of that, so discard leading lines up to the first `{` or `[` before calling `JSON.parse()`.*

### Recipe 4: Structured Multi-File Edits via `changeMode`
**Problem:** You want Gemini to suggest concrete code replacements across multiple files in a format that can be programmatically verified or applied.
**Solution:** Enable `changeMode: true`.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Refactor @src/utils/commandExecutor.ts to use AbortController for process timeouts.",
    "changeMode": true
  }
}
```
*Gemini is instructed to answer in this exact shape, which the server's parser reads:*
````
**FILE: src/utils/commandExecutor.ts:42**
```
OLD:
// existing code — an exact, Ctrl+F-findable copy from the file
NEW:
// new code with AbortController
```
````
*What the tool returns to you is the parsed, validated form: a `[CHANGEMODE OUTPUT …]` header, then one `### Edit N: <filename>` section per edit with a "Replace this exact text" block and a "With this text" block.* Large responses are split into chunks; the footer then tells you the `cacheKey` and the next `chunkIndex` to pass to `fetch-chunk`.

On that normal path no `FILE:` / `OLD:` / `NEW:` marker reaches you. The exception is a parse failure: when nothing parses, the tool answers `No edits found in Gemini's response. Please ensure Gemini uses the OLD/NEW format.` followed by the model's raw reply — markers and all — instead of inventing edits.

### Recipe 5: Continuing a Thread with `conversationId`
**Problem:** You asked for an audit, and the follow-up question ("which of those would you fix first?") would otherwise re-send the whole context.
**Solution:** An `ask-gemini` plain-text reply ends with `🧵 conversationId: <id>` — not a `jsonSchema` or `changeMode` reply, whose body is parsed, and never a `gemini-plan` or `brainstorm` reply, which report no id at all. Pass it back.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Which of those findings would you fix first, and why?",
    "conversationId": "a4d4c538-336f-49ef-a4ba-ec2267dc35b2"
  }
}
```
*Resuming replays the thread's history, so it is not free — but it is cheaper and far more accurate than restating the context yourself.*

### Recipe 6: Free, Zero-Token Status Commands
**Problem:** You want quota, the installed skills or the current model without spending an agent turn.
**Solution:** agy answers `/`-prefixed prompts in its command layer, with no model call at all. The relay passes `--disable-slash-commands` by default — on any build that advertises the flag, like every flag it sends (§6) — so opt in explicitly.

```json
{
  "name": "ask-gemini",
  "arguments": { "prompt": "/usage", "allowSlashCommands": true }
}
```
*Available print-mode commands include `/usage`, `/skills`, `/help`, `/agents`, `/model`, `/effort`, `/permissions`, `/hooks`, `/changelog`, `/config` and `/credits`. Without `allowSlashCommands: true` the same prompt is sent to the model verbatim — which costs a turn and answers the wrong question. On a build whose `--help` does not advertise `--disable-slash-commands`, the flag is not sent at all, so a `/` prompt expands whatever this setting says.*

### Recipe 7: Running a Custom Agent Persona
**Problem:** You maintain a reviewer persona as an `agent.md` agent and want that persona, not the default one, to answer.
**Solution:** Name it with `agent`.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Review @src/backends/agy.ts for lost-error paths.",
    "agent": "reviewer",
    "mode": "plan"
  }
}
```
*The flag is only sent when the installed `agy --help` advertises `--agent`; on an older build the parameter is ignored rather than failing the run.*

### Recipe 8: Letting the Agent Act Without a Human to Approve
**Problem:** In `accept-edits` mode a write the persisted permission settings do not allow is refused, and in a headless run nobody is there to approve it.
**Solution:** `skipPermissions: true` runs agy with `--dangerously-skip-permissions`, on any build that advertises the flag — the same gate every flag passes (§6).

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Apply the rename across @src/utils/logger.ts and its callers.",
    "mode": "accept-edits",
    "skipPermissions": true
  }
}
```
*This is not cosmetic: since agy 1.1.5 headless runs honour the persisted permission settings. Understand what those settings already allow before switching this on — the flag removes the last gate on file writes and shell commands, and the relay's project-root jail covers only what the relay inlines, not what the agent chooses to read or run.*

---

## 4. What an `@` Token Sends

The agy backend does not inline `@file` itself, so the server does it — which is also what keeps the project-root jail in the data path. Per token:

| Token resolves to | Result |
| :--- | :--- |
| A file inside the project root | Inlined between `----- BEGIN FILE: … -----` / `----- END FILE: … -----` markers. |
| A directory (`@.` is the whole project) | Every text file under it is inlined, recursively, minus the skips listed below. |
| A glob (`*`, `**`, `?`) | Its matches are inlined. Bracket classes are not glob syntax here. |
| Nothing | Left in the prompt verbatim — so `@param`, `@Injectable()` and `@types/node` survive as prose. |
| Anything outside the project root | Refused, and the refusal aborts the whole call rather than that one token. `~`, absolute paths outside the root, `..` traversal like `@../../etc/passwd`, and in-root symlinks whose target lies outside are all caught (CVE-2026-0755). |

### Limits and skips

Check the footers before you treat an answer as whole-project coverage. A partial corpus never reads as complete. Narrow the reference rather than retrying the same one.

| Limit or skip | What happens |
| :--- | :--- |
| 256 KB per file | Longer files are inlined truncated, with a `TRUNCATED` marker naming the real size. |
| 2 MB across the whole prompt | When the total budget runs out the remaining files are dropped and an `OMITTED` footer names them. |
| A file that exists but cannot be read | Named in an `UNREADABLE` footer. |
| A binary file | Sniffed and skipped, on every path, including a file you name directly. Use `@` for text, code, JSON, YAML, markdown and logs; a compiled binary or an image costs you the round trip and arrives as nothing. |
| `node_modules`, `.git`, `dist`, and the VitePress `cache` / `dist` directories | Skipped during directory and glob expansion. |
| A secret-looking file, during directory or glob expansion | Skipped: `.env` and its variants, `.npmrc`, `.netrc`, `.git-credentials`, `id_rsa`-style private keys, and anything ending in `.pem`, `.key`, `.pfx` or `.p12`. |
| A file you name directly | Neither the secret list nor the directory skip list applies, so `@.env` is not filtered out for being a secret — its contents go to Gemini, which is treated as your own deliberate choice. It can still be dropped for being binary, unreadable or out of budget, and in each case the `@token` stays in the prompt verbatim. |

---

## 5. Model Selection Guide

Run `gemini-models` for the live list — it comes from `agy models`, so it is the only list that cannot go stale.

| Model Identifier | Alias | Best For | Reasoning Effort |
| :--- | :--- | :--- | :--- |
| `gemini-3.8-flash-high` | `flash` | **What `gemini-plan` and `gemini-image` use.** Code analysis, refactoring, Q&A, and planning. | High |
| `gemini-3.8-flash-medium` | - | Moderate complexity, where the deepest reasoning pass is not worth its thinking tokens. | Medium |
| `gemini-3.8-flash-low` | - | Bulk summaries, syntax conversions, or classification. | Low |
| `gemini-3.1-pro-high` | `pro` | **Deep architectural reasoning.** Math proofs, complex distributed algorithms, exhaustive edge case analysis. | High |
| `gemini-3.1-pro-low` | - | Pro-grade knowledge lookups without a deep thinking pass. | Low |
| `gemini-3.7-flash-high` / `-medium` / `-low` | - | Previous generation flash family, at three reasoning depths. | High → Low |
| `gemini-3.6-flash-high` / `-medium` / `-low` | - | Older flash family, still live. Useful for reproducing an earlier run. | High → Low |

"Advertised" because only two tools actually pin it. `gemini-plan` falls back to `gemini-3.8-flash-high` when you name no model, and `gemini-image` hardcodes it — it has no `model` parameter to name. `ask-gemini` and `brainstorm` do not: leave `model` unset there and no `--model` flag is sent at all, so agy answers on the model it is configured for.

Nothing in this repository or in `agy models` reports a per-model latency tier or context-window size, so none is given here. `effort` is the real, documented dial.

Aliases are normalized before the call: `flash`, `gemini-flash`, `gemini-3.8-flash` — and the retired `gemini-2.5-flash` / `gemini-3.5-flash` — all become `gemini-3.8-flash-high`; `pro`, `gemini-pro`, `gemini-3.1-pro` and the retired `gemini-2.5-pro` become `gemini-3.1-pro-high`. `effort` applies to the Gemini 3.8 Flash, 3.7 Flash and 3.1 Pro families.

### Non-Gemini Models on a Separate Quota Bucket

`agy` also serves three models that are not Gemini, and they draw on a **different quota bucket** from the Gemini ones — so they are still available on a day the Gemini weekly allowance is spent, and they are the honest way to get a genuinely independent second opinion:

| Model Identifier | Best For |
| :--- | :--- |
| `claude-opus-4-6-thinking` | A cross-vendor check on the reasoning a Gemini run produced. |
| `claude-sonnet-4-6` | Faster cross-vendor review and code Q&A. |
| `gpt-oss-120b-medium` | A third opinion when two models disagree. |

Pass them through `model` exactly like any Gemini id. They are absent from the built-in fallback list, so if `gemini-models` shows only Gemini ids, the live `agy models` call failed and you are reading the fallback.

---

## 6. Environment & Backend Configuration Reference

| Environment Variable | Allowed Values | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `GEMINI_MCP_BACKEND` | `agy`, `antigravity`, `gemini` | Date-resolved (see below) | Selects which CLI engine executes prompts. |
| `AGY_CLI_PATH` | File path string | Auto-probed | Full path to `agy` or `agy.exe` binary. |
| `GEMINI_CLI_PATH` | File path string | `gemini` from PATH | Full path to the legacy `gemini` executable. **Windows only** — `resolveGemini` returns the bare command before it ever reads the override on macOS and Linux, where `gemini` comes from PATH. (`AGY_CLI_PATH` above is honoured on every platform.) |
| `GEMINI_MCP_TIMEOUT` | Number (minutes) | `45` | Maximum total time allowed for a child process before the timeout kill. Any finite value greater than zero is accepted, fractions included (`0.5` is 30 seconds); only a non-numeric or non-positive value falls back to the default. Read once at module load, so a change needs a server restart. |
| `AGY_PRINT_TIMEOUT` | Duration string (e.g. `10m`, `44m`) | Derived | Value forwarded to `agy --print-timeout`. When unset it is derived from the wrapper timeout to stay strictly below its kill deadline, so agy can report its own timeout: 60 seconds under the wrapper above a two-minute wrapper deadline, and half of it at or below two minutes. An explicit value overrides that derivation outright and is forwarded as given, with no clamping — set it above the wrapper deadline and the wrapper kills agy first. |
| `GEMINI_MCP_TEST_TOOLS` | Any non-empty value | Unset | Registers the test-only `timeout-test` tool, so the server exposes ten tools instead of nine. For the test suite. |
| `AGY_MCP_PTY` | `1`, `true` or `yes` | Off | Opt-in POSIX-only recovery: re-run `agy -p` under a pseudo-terminal (via `script(1)`) when a TTY-only build printed nothing to a pipe. This re-run carries its **own independent 10-minute cap**, hard-coded in `src/backends/agyOutput.ts` and unaffected by `GEMINI_MCP_TIMEOUT` or `AGY_PRINT_TIMEOUT`; on expiry the whole process group is killed with `SIGKILL`. |

**How the default backend is resolved.** There is no hardcoded default. The server compares today's date to the Gemini CLI retirement date, `2026-06-18`: before it, the legacy `gemini` CLI; on or after it, `agy` — because once gemini is retired for free/Pro/Ultra tiers, agy is the only live option. An explicit `GEMINI_MCP_BACKEND` always wins, and setting it also suppresses the one-per-process migration notice. An unrecognized value logs a warning and falls back to `gemini`.

**The argv is capability-aware, uniformly.** On the first run the server reads `agy --help` once and records which flags that build advertises. **One rule covers every flag: it is sent only when the installed agy advertised it.**

Gated that way in the argv builder: `--model`, `--effort`, `--json-schema`, `--mode`, `--add-dir`, `--conversation`, `--sandbox`, `--agent`, `--disable-slash-commands` and `--dangerously-skip-permissions`. Decided the same way in `run`: `--input-format` / `--output-format` and `--print-timeout`, alongside how the prompt is delivered.

| What the build advertises | How the prompt travels |
| :--- | :--- |
| `--input-format` | `stream-json` on both `--input-format` and `--output-format`; the prompt goes to stdin as one NDJSON message. |
| `--output-format` alone | `-p <prompt>` on argv, with `--output-format json`. |
| Neither | `-p <prompt>` on argv. Neither flag is sent. |

One prompt is exempt from stdin delivery whatever the build advertises: a slash command let through by `allowSlashCommands`, because agy answers it in the CLI itself and refuses to under `--input-format stream-json`. That prompt goes on argv with `-p`.

When `agy --help` is missing, times out or cannot be parsed, the probe returns `NO_AGY_CAPABILITIES` — every flag `false` — and **no flags at all** are sent. The run falls back to agy's own defaults rather than risking an unknown flag, which would make agy exit non-zero and fail the whole request.

The probe is cached for the life of the server process, so after agy self-updates in the background, restart the server to pick up new capabilities.

---

## 7. Troubleshooting Quick Reference

The seven things you will actually hit from a tool call. Everything else — install problems, PTY
recovery, transcript fallbacks — is in [Troubleshooting](./resources/troubleshooting.md).

| Symptom | Probable Cause | Instant Solution |
| :--- | :--- | :--- |
| `Could not find the "agy" executable.` | `agy` not on PATH. | On Windows it installs to `%LOCALAPPDATA%\agy\bin\agy.exe` (older builds: `%LOCALAPPDATA%\Antigravity\`); add that directory to PATH or set `AGY_CLI_PATH` to the full path. Otherwise install it: `curl -fsSL https://antigravity.google/cli/install.sh \| bash`. |
| `invalid model selection … Available models: …` | agy's own verdict, surfaced verbatim. | Use an id from that list, or from `gemini-models`. The same path surfaces agy's real quota and auth text instead of a generic exit code. |
| `agy produced no output for <cwd> …` | Exit 0 with no stdout, stderr or transcript — usually a dropped login. | Run `agy -p "hi"` directly, or `gemini-doctor` for the login and quota check. |
| `Refusing @file reference outside the project directory: "@…"` | Path passed to `@` escapes the project root (e.g. `@../secret`, `@~/.ssh/id_rsa`, or an in-root symlink pointing out). | Pass a path relative to the project root, with no `..` traversal. The whole call is refused, not just that token. |
| A tool call was refused with nobody to approve it | Headless runs honour agy's persisted permission settings. | Re-run with `skipPermissions: true` once you know what those settings allow, or ask for analysis with `mode: "plan"` instead. |
| `❌ Cache miss: No chunks found for cache key "…"` | The 10-minute `changeMode` chunk TTL expired, or the temp cache was cleared. | Re-run the original `changeMode` request to regenerate the chunks. |
| A second call sits there returning nothing | Every agy run is serialized behind one queue inside the server, so a concurrent call waits for the first to finish, however long it takes. | Wait, or batch the questions into one prompt. Fanning out buys you no parallel work. |
