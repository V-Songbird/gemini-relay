# Workflow Examples

Jobs with more than one step. For single-sentence asks, see [Prompt recipes](./natural-language.md).

Each one below is a normal message to your agent. Where an integrator needs the exact call, it is collapsed underneath.

## Review a diff before you commit

Write the diff to a file, then point at it.

```bash
git diff --staged > .review.patch
```

> *"Have gemini review `@.review.patch` for correctness regressions before I commit."*

The patch is one file, so this stays cheap even on a large change set.

## Walk a codebase in one thread

Five questions, each building on the last. Ask the first, then pass the conversation id it reports back with every follow-up so Gemini keeps the earlier answers.

```
1. "Ask gemini how the frontend and backend connect: @package.json @src/index.js @client/App.jsx"
2. "Have gemini review API security in @routes/api/*.js @middleware/auth.js"
3. "Get gemini to suggest database optimizations for @models/*.js @db/queries/*.sql"
4. "Ask gemini how to improve frontend performance in @client/**/*.jsx @client/**/*.css"
5. "Which critical paths lack test coverage? @src/**/*.js @test/**/*.test.js — ask gemini"
```

Resuming replays the thread's history, so start a fresh one when the subject changes. Not every reply reports an id — which ones do is in the [Tool Reference](./commands.md).

## Get findings you can parse

Hand Gemini a schema and the answer comes back as JSON, not prose. Useful when the next step is code rather than a person.

> *"Ask gemini to audit `@src` for vulnerabilities, and give me the findings as JSON."*

<details>
<summary><strong>For AI agents — the call</strong></summary>

```json
{ "name": "ask-gemini", "arguments": {
  "prompt": "Audit @src for vulnerabilities.",
  "mode": "plan", "effort": "high",
  "jsonSchema": { "type": "object", "required": ["findings"], "properties": {
    "findings": { "type": "array", "items": { "type": "object",
      "required": ["file", "line", "severity", "summary"],
      "properties": { "file": {"type":"string"}, "line": {"type":"integer"},
        "severity": {"enum":["low","medium","high","critical"]},
        "summary": {"type":"string"} } } } } } } }
```

`mode: "plan"` keeps the run read-only. A `jsonSchema` body carries no token usage line and no conversation id, so that it stays valid JSON.

</details>

## Get edits your agent can apply

`changeMode` returns each change as the exact text to replace and the text to replace it with, so your agent edits the files without re-reading them.

> *"Ask gemini to refactor `@src/services/*.js` to the Repository pattern, in changeMode."*

The reply arrives under a `[CHANGEMODE OUTPUT - …]` header as numbered `### Edit N: <file>` sections. A large set arrives in chunks, and the reply tells you how to fetch the rest. Both formats, and what comes back when the parse fails, are in the [Tool Reference](./commands.md).

<details>
<summary><strong>For AI agents — the call</strong></summary>

```json
{ "name": "ask-gemini", "arguments": {
  "prompt": "@src/services/*.js refactor these to use the Repository pattern.",
  "changeMode": true } }
```

</details>

## Plan a migration before touching it

Prose is the wrong shape for a multi-week change. `gemini-plan` returns phases in order, with dependencies and risks.

> *"Use gemini-plan to work out what it takes to move this service from Express 4 to Express 5. Context: `@package.json` `@src/index.js`."*

<details>
<summary><strong>For AI agents — the call</strong></summary>

```json
{ "name": "gemini-plan", "arguments": {
  "task": "Upgrade this service from Express 4 to Express 5.",
  "context": "@package.json @src/index.js", "effort": "high" } }
```

</details>

Take the phases back and execute them with your own editing tools. `gemini-plan` is read-only and reports no conversation id, so a follow-up means restating the plan text in a fresh `ask-gemini` call.

## Read something too big to open

`package-lock.json` in this repo is a file your agent should never open. Gemini can.

> *"Ask gemini how many packages are in `@package-lock.json`. Just the number."*

The whole file goes to Gemini; one line comes back. That is the point of the relay — see [Best practices](./best-practices.md) for when to point at files and when to let Gemini find them.
