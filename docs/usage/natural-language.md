# Prompt Recipes

Ask in a sentence. Your agent picks the tool and fills in the arguments.

You never have to write an MCP call by hand. Say "ask gemini" and what you want, and the request routes to one of the nine tools — nearly always `ask-gemini`.

## What to say

| You want to… | Say something like |
| --- | --- |
| Review a diff before you commit | *"Have gemini review `@.review.patch` for correctness regressions."* |
| Understand one file | *"Ask gemini what `@src/utils/geminiExecutor.ts` does."* |
| Understand a codebase you just cloned | *"Ask gemini for an architecture overview of `@package.json` `@src` `@README.md`."* |
| Find what is risky | *"Ask gemini to find the riskiest code in this repo."* |
| Audit for security problems | *"Ask gemini to audit `@src` `@package.json` for hardcoded secrets and injection holes."* |
| Debug a failure | *"Use gemini to read `@logs/error.log` and `@src/api/handler.js` and tell me why I'm getting 'undefined is not a function'."* |
| Plan a feature before writing it | *"Use gemini-plan to design retry with backoff for the upload queue."* |
| Find what the tests miss | *"Ask gemini what `@src/**/*.js` `@test/**/*.test.js` isn't covering."* |
| Read something too big to open | *"Ask gemini what's in `@package-lock.json`."* |
| Get edits back, ready to apply | *"Ask gemini to refactor `@src/services/*.js` to the Repository pattern, in changeMode."* |
| Get an answer your code can parse | *"Ask gemini for the outdated deps as JSON."* |
| Kick ideas around | *"Brainstorm ten ways to cut our cold-start time."* |
| Make a picture | *"Use gemini-image for a 16:9 dark hero image, save it to `assets/hero.png`."* |
| Find out why it broke | *"Run gemini-doctor."* |

Any of these phrasings routes the request: *use gemini*, *ask gemini*, *gemini please*, *have gemini*, *get gemini to*, *with gemini*.

## Point at files inside the sentence

An `@path` works in ordinary prose. Write it where it reads naturally.

```
I need to debug this — ask gemini about @app.js and @error.log
```

`@` takes a file, a folder, `@.` for the whole project, or a glob like `@src/**/*.ts`. A token that resolves to nothing is left alone, so `@param` and `@types/node` reach the model as written. On the default `agy` backend the relay expands these itself before the prompt is sent; the legacy `gemini` backend leaves it to the CLI. What gets skipped and how much fits is in [Context inlining](../concepts/file-analysis.md).

You can also say nothing about files at all. Gemini has its own file, search and shell tools, and will go looking.

## When a sentence is not enough

Reach for an explicit tool call only to pin something a plain request would not set — the model, the reasoning effort, read-only plan mode, or a JSON schema.

<details>
<summary><strong>For AI agents — the call that pins those</strong></summary>

```json
{ "name": "ask-gemini", "arguments": {
  "prompt": "@app.js @error.log what is crashing here?",
  "model": "gemini-3.1-pro-high", "effort": "high", "mode": "plan" } }
```

Every parameter, type and default is in the [Tool Reference](./commands.md).

</details>

Jobs with more than one step — a diff to generate first, several questions in one thread, edits to apply — are in [Workflow examples](./examples.md). What makes a question worth asking is in [Best practices](./best-practices.md).
