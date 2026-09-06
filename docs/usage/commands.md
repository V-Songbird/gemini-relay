# Tool Reference

Nine tools. You rarely name one — you say what you want and your agent picks.

This page says what each tool is for and how to ask for it. Every parameter, type, default and enum sits in one collapsed block at the end.

## ask-gemini

The one you will use most. It sends Gemini a question and hands back the answer. Point at files with `@path` and their contents travel with the question, so your own agent never opens them.

> *"Have gemini review `@src/backends` for race conditions."*

It can also come back with edits your agent applies directly, or with JSON that matches a schema you supply. Both are in the block below.

## gemini-plan

A planner, not a builder. Give it a goal and you get a phased blueprint — the steps in order, what depends on what, where the risk is, how to check each phase. It always runs in read-only plan mode, so nothing on disk changes. Reasoning effort defaults to high.

> *"Use gemini-plan to design retry with backoff for the upload queue."*

Its reply never carries a conversation id, so there is no thread to resume. To follow up, restate or re-attach the plan text in a fresh `ask-gemini` call — that opens a new conversation and reports an id of its own.

## gemini-image

Makes a picture from a description, and can copy the file straight into your project.

> *"Use gemini-image for a 16:9 dark hero image, save it to `assets/hero.png`."*

## gemini-models

Lists the models you can actually reach, the default selections, the reasoning tiers, and what the active backend can do. No arguments.

> *"Run gemini-models."*

## gemini-doctor

Your first move when something breaks. It reports which CLI is installed (`agy` or `gemini`), its version and resolved path, the active backend, and — from a free `agy -p "/usage" --output-format json` — whether you are signed in and how much quota each bucket has left. It costs no tokens. No arguments.

> *"Run gemini-doctor."*

## brainstorm

Ideas, run through a named method: SCAMPER, design thinking, lateral, divergent, convergent, or let it choose. Each idea comes back with feasibility and impact notes unless you turn that off.

> *"Brainstorm ten ways to cut our cold-start time."*

Like `gemini-plan`, it reports no conversation id. Only `ask-gemini` does.

## fetch-chunk

A large set of `changeMode` edits comes back in chunks. `fetch-chunk` pulls the next one out of the cache without a second model turn. The first reply spells out the exact call to make.

## ping

Returns whatever you passed as `prompt`, or `Pong!` when you passed nothing. It answers in process — nothing is spawned and nothing is timed — so it proves the MCP transport is alive, not that the CLI is.

## Help

Prints the active backend CLI's own help text. No arguments.

<details>
<summary><strong>For AI agents — every parameter and default</strong></summary>

Nine tools, every one of them above. A tenth, `timeout-test`, is registered only when `GEMINI_MCP_TEST_TOOLS` is set. Every row below is taken from the server's live `tools/list` output.

| Tool | Parameter | Type · default | Notes |
| --- | --- | --- | --- |
| `ask-gemini` | `prompt` | string, required | Supports `@file`, `@dir`, `@.`, globs. See [Context inlining](../concepts/file-analysis.md). |
| | `model` | string | Any id `gemini-models` lists, or the aliases `flash` / `pro`. Unset sends no `--model`, so agy answers on its own configured model. See [Models](../concepts/models.md). |
| | `effort` | `low` \| `medium` \| `high` | Depth of thinking tokens. |
| | `mode` | `plan` \| `accept-edits` | `plan` is read-only; `accept-edits` applies edits directly. |
| | `jsonSchema` | object \| string | Enforces structured JSON output. Suppresses `includeUsage` and the conversation-id footer so the body stays parseable. |
| | `addDirs` | string[] | Extra workspace directories added to context. |
| | `conversationId` | string | Resume a previous session. A plain-text reply reports the id of the conversation it created or continued; a `jsonSchema` or `changeMode` reply does not, because its body is parsed. |
| | `agent` | string | Name of a custom `agent.md` agent (a reviewer persona, say) to run instead of the default. Ignored by an agy build without `--agent`. |
| | `allowSlashCommands` | boolean · `false` | `true` lets a prompt starting with `/` expand as an agy command or skill (`/usage`, `/skills`), answered for free without a model turn. Default `false`: the prompt goes to the model verbatim. |
| | `skipPermissions` | boolean · `false` | Runs agy with `--dangerously-skip-permissions`. Headless runs honour the persisted permission settings, so without this a tool call the settings disallow is refused with nobody there to approve it. |
| | `includeUsage` | boolean · `false` | Appends a token usage and timing line. Ignored when `jsonSchema` is set: the structured body is returned untouched so it stays valid JSON, which means the two together yield no token line. |
| | `sandbox` | boolean · `false` | Forwarded as `--sandbox`. On the agy backend the reply carries a notice — print mode does not isolate tool execution, so the request cannot be guaranteed. The legacy `gemini` backend does isolate. |
| | `changeMode` | boolean · `false` | Returns structured edit blocks. Formats below. |
| | `chunkIndex` | number \| string | Which chunk of a `changeMode` response to return (1-based). With `chunkCacheKey` it replays that cached chunk with no model turn; on its own with `changeMode: true` it still runs the analysis and then selects which chunk of that fresh result comes back, and an index outside that range falls back to chunk 1. No such fallback on the cached path: an out-of-range index is refused with `❌ Invalid chunk index: N` and the available range, an unknown key with `❌ Cache miss`. |
| | `chunkCacheKey` | string | The cache key a multi-chunk `changeMode` response reported. Must be exactly eight lowercase hex characters or the call is refused. |
| `gemini-plan` | `task` | string, required | The architectural feature, refactor or problem to design. |
| | `context` | string | Constraints, requirements, or `@file` references. |
| | `model` | string · `gemini-3.8-flash-high` | Pinned unless you override it; pass `gemini-3.1-pro-high` for deeper reasoning. |
| | `effort` | `low` \| `medium` \| `high` · `high` | |
| | `addDirs` | string[] | |
| | `includeUsage` | boolean · `true` | Appends the token metrics line. Never reports a conversation id. |
| `gemini-image` | `prompt` | string, required | Subject, environment, lighting, style, colours. |
| | `aspectRatio` | enum · `1:1` | `1:1` `16:9` `9:16` `4:3` `3:4` `3:2` `2:3` `5:4` `4:5` `21:9` `4:1` `1:4` `8:1` `1:8`. Passed inside the generation prompt, not as a flag — and there is no image-model parameter, because `--model` selects the planner model and rejects image model ids. |
| | `size` | `512` \| `1K` \| `2K` \| `4K` | Omit to let Gemini pick. |
| | `outputPath` | string | Path relative to the project root to copy the image to, e.g. `assets/hero.jpg`. A path escaping the project root is refused. |
| `brainstorm` | `prompt` | string, required | The challenge or question to explore. |
| | `model` | string | Unset sends no `--model`. |
| | `methodology` | `divergent` \| `convergent` \| `scamper` \| `design-thinking` \| `lateral` \| `auto` · `auto` | |
| | `effort` | `low` \| `medium` \| `high` | |
| | `domain` | string | `software`, `business`, `product`, and so on. |
| | `constraints` | string | Budget, time, technical, legal. |
| | `existingContext` | string | Background, previous attempts, current state. |
| | `ideaCount` | integer · `12` | |
| | `includeAnalysis` | boolean · `true` | Adds feasibility, impact and implementation analysis. Never reports a conversation id. |
| `fetch-chunk` | `cacheKey` | string, required | Both are reported by the initial `changeMode` reply. |
| | `chunkIndex` | number, required | 1-based. |
| `gemini-models` | — | | Live catalogue from `agy models`, plus backend capabilities. |
| `gemini-doctor` | — | | Binaries, versions, backend, plus login and quota via a free `agy -p "/usage" --output-format json`. |
| `ping` | `prompt` | string · `""` | The only parameter it declares; any other key, `message` included, is stripped before the handler sees it. |
| `Help` | — | | The active backend CLI's own help. |

**One rule for every flag.** A flag is sent only when the installed agy advertised it in `agy --help`. There is no privileged flag and no exception — `--agent`, `--disable-slash-commands` and `--dangerously-skip-permissions` are treated exactly as `--model`, `--effort`, `--mode`, `--json-schema`, `--add-dir`, `--conversation` and `--sandbox` are. When that probe is missing, unparseable or times out, every capability reads false and **no flags at all** are sent: the run falls back to agy's own defaults rather than risk an unknown flag failing it outright.

**changeMode, what the model is asked to emit.** `changeMode` wraps your request in a template that makes the model answer in exactly this shape, which the server parses into applicable edits. The `OLD:` section must be a byte-exact copy of what is in the file.

````
**FILE: src/utils/helper.js:100**
```
OLD:
function getMessage() {
  return "Hello World";
}
NEW:
function getMessage() {
  return "Hello Universe!";
}
```
````

**changeMode, what you receive.** Not that. When the reply parses, the markers do not come back: the server returns a rendered form — a `[CHANGEMODE OUTPUT - …]` header, then one `### Edit N: <filename>` section per edit with a `Replace this exact text:` fenced block and a `With this text:` fenced block, then a footer telling you to apply the edits in order. When more than five edits were parsed, a summary block is prefixed to the first chunk, ahead of the header. Large edit sets are chunked and cached; when a chunk is not the last one the footer also carries the `fetch-chunk cacheKey="…" chunkIndex=…` call that retrieves the next.

```
[CHANGEMODE OUTPUT - Gemini has analyzed the files and provided these edits]

I have prepared 1 modification for your codebase.
…
### Edit 1: src/utils/helper.js

Replace this exact text:
…
With this text:
…
```

**Neither failure path returns that shape.** If nothing parses you get `No edits found in Gemini's response…` followed by the model's raw reply, markers and all. If the parsed edits fail validation you get `Edit validation failed:` and the reasons, with no rendered edits.

</details>

## Going deeper

| | |
| --- | --- |
| [Prompt recipes](./natural-language.md) | How to phrase a request |
| [Workflow examples](./examples.md) | Jobs with more than one step |
| [Best practices](./best-practices.md) | When to point at files, when to spend effort |
| [Context inlining](../concepts/file-analysis.md) | What `@` sends, what it skips, and the budgets |
| [Models](../concepts/models.md) | The catalogue, reasoning effort, and the quota buckets |
| [Agent guide](../AGENT_GUIDE.md) | Schemas, recipes, and how to spend a context window well |
