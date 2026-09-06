# MCP API Surface

This page is the protocol, not the tools. What an MCP client sees when it talks to `gemini-relay`: the methods the server answers, the shape of what comes back, the markers the server adds to the response text, and what a failure looks like.

Per-tool parameters are not here. They live in the [Tool Reference](/usage/commands) and, with schemas and recipes, in the [Agent Guide](/AGENT_GUIDE). Read this one when you are writing a client, or when you need to know why a response is shaped the way it is.

---

## Server identity and transport

| Field | Value |
| :--- | :--- |
| Server name | `gemini-relay` |
| Version | `1.2.0` |
| Transport | stdio — the client spawns the process and speaks JSON-RPC over stdin/stdout |
| Declared capabilities | `tools`, `prompts`, `logging` |

The `logging` capability is declared, but the server does not currently emit `notifications/message`. Its own diagnostics go to **stderr**, prefixed with `[GMCPT]`, where most clients collect them as server logs.

Two things are written there, and neither carries a prompt body.

The **argv of each spawn** keeps flag names and replaces every other element with `<41823 chars>`, so an inlined `@.` prompt never dumps megabytes of your source into the client log. On a `stream-json` build the prompt is not in argv at all, since it travels on stdin. No argv is retained between calls.

The **`tools/call` arguments** are shaped only where they are strings:

```
Tool ask-gemini(prompt=<412 chars> effort=<4 chars> changeMode=true)
```

Every string argument is reduced to its length. Non-string arguments — booleans, numbers, `addDirs`, and a `jsonSchema` passed as an object — are serialized whole.

---

## `tools/list`

Nine tools, in registry order: `ask-gemini`, `gemini-plan`, `gemini-image`, `gemini-models`, `gemini-doctor`, `brainstorm`, `fetch-chunk`, `ping`, `Help`. (A tenth, `timeout-test`, is registered only when `GEMINI_MCP_TEST_TOOLS` is set for the test suite.)

Each `inputSchema` is generated from the tool's Zod schema, so the JSON Schema the client receives is the same object the server validates against, declared defaults included. It is always `{ "type": "object", "properties": {...}, "required": [...] }`. For what those properties and defaults are, see the [Agent Guide](/AGENT_GUIDE).

---

## `tools/call`

Every tool answers with a single text block:

```json
{
  "content": [{ "type": "text", "text": "Gemini response:\n…" }],
  "isError": false
}
```

There are no image or resource content blocks — `gemini-image` also returns text, containing a markdown embed with a `file:///…` URL and the absolute path of the generated file.

### Failure shapes

| Situation | What the client gets |
| :--- | :--- |
| The tool threw | `isError: true`, text `Error executing <tool>: <message>` |
| Arguments failed validation | `isError: true`, text `Error executing <tool>: Invalid arguments for <tool>: <field>: <message>` |
| The tool name is not registered | A JSON-RPC error, not a result: `Unknown tool: <name>` |
| The CLI ran too long | `<command> timed out after <n>s` — the child is killed with `SIGKILL` after `GEMINI_MCP_TIMEOUT` minutes (default 45) |
| `agy` refused the request | agy's own text, verbatim — e.g. `invalid model selection … Available models: …` — rather than a generic exit code |

---

## Conventions inside the response text

The transport carries plain text, so the server marks up its own additions:

| Marker | Meaning |
| :--- | :--- |
| `Gemini response:` | Prefix on every `ask-gemini` reply except `changeMode` — a `jsonSchema` reply carries it too, so the body is not bare JSON. |
| `🧵 conversationId: <id>` | The thread the run created or continued. Appended by `ask-gemini` alone, on a plain-text reply: omitted when `jsonSchema` is set and in `changeMode`, and `gemini-plan` and `brainstorm` never report one at all. Pass it back to `ask-gemini` as `conversationId` to resume. |
| `⚠️ <notice>` | One or more lines *prepended* to the body when the active backend could not honour part of the request (model selection, reasoning effort, mode, JSON schema, sandbox isolation), when the backend default has flipped to `agy`, and when the run itself reports a non-SUCCESS status or names tool actions it refused. A flag the installed agy build does not advertise is dropped without a notice, so this is not a complete record of what was applied. |
| `📊 [Tokens: … in, … out (… thinking)]` | Appended when `includeUsage` is set — but never when `jsonSchema` is also set, because a trailing line would stop the body being valid JSON. The two are effectively mutually exclusive. |
| `[CHANGEMODE OUTPUT …]` | Header of a parsed `changeMode` response, followed by one `### Edit N: <file>` section per edit — each a "Replace this exact text:" block and a "With this text:" block — and a footer, which carries the `fetch-chunk` continuation call when the response was chunked. This rendered shape is what a successfully parsed response looks like; the `**FILE:**`/`OLD:`/`NEW:` markers are what the model is asked to emit, and reach the caller only when nothing parsed, in which case the tool answers `No edits found in Gemini's response…` followed by the model's raw text. |

---

## `prompts/list` and `prompts/get`

Every tool is also exposed as an MCP prompt under the same name, so slash-command-style clients can surface them. Prompt arguments are derived from the same Zod schema — name, description, and whether it is required.

`prompts/get` returns one `user` message whose text tells the assistant which tool to call:

```
Use the ask-gemini tool: Explain @src/index.ts (model: pro) [changeMode]
```

The `prompt` argument comes first, boolean `true` arguments render as `[name]`, anything else renders as `(name: value)`, and `false`/`null`/`undefined` are dropped.

---

## Progress notifications

The server sends `notifications/progress` **only** when the client includes a `_meta.progressToken` in `tools/call`. A run without one produces no notifications at all.

1. Immediately: `progress: 0`, message `🔍 Starting <tool>`.
2. Every 25 seconds: an incrementing `progress`, a rotating status message, and the last 150 characters of the CLI's output so far.
3. On completion: `progress: 100`, `total: 100`, and `✅ <tool> completed successfully` or `❌ <tool> failed`.

`total` is omitted until that final notification, so a client should treat the run as indeterminate progress.

Each call owns its keepalive state. This matters because `agy` runs are serialized behind a single queue inside the server: a second concurrent call waits for the first, and it is exactly that queued call whose client is most likely to give up — so it keeps emitting its own keepalives while it waits.

---

## See also

[How It Works](/concepts/how-it-works) traces the path a call takes from MCP request to `agy` process. Parameters and schemas are in the two pages linked at the top.
