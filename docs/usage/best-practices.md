# Best Practices

Advice, not specification. The parameters live in the [Tool Reference](./commands.md); what `@` does exactly lives in [Context inlining](../concepts/file-analysis.md).

## Point at files, or let Gemini look

Both work. They fail differently.

**Name the files with `@`** when you know which ones matter. You get exactly the corpus you asked for, every time, and you can see it in the prompt. Start narrow — one file, then its neighbours, then the module — and widen only when the answer says you need to.

**Say nothing and let Gemini go looking** when you do not know where the problem is. Gemini has file, search and shell tools and uses them in whatever folder the server runs in. That is the right call for *"find the riskiest code in this repo"* and the wrong one for *"review this function"*.

Pointing at a folder that has already been ruled out is the common waste. `@node_modules/**/*.js` is worse than useless: `node_modules` is skipped during expansion, so the token matches nothing and reaches the model as literal text.

## Keep the reference inside what fits

There is a cap on how much a prompt can inline, and hitting it does not fail the call — it quietly narrows the coverage.

Read the prompt for `TRUNCATED`, `OMITTED:` and `UNREADABLE:`. Any of the three means the answer was written on partial coverage, so narrow the reference and ask again. A binary file is the one drop that says nothing at all: it is skipped, and its token stays in the prompt as written, so `@logo.png` arrives as the text `@logo.png`.

The exact caps are in [Context inlining](../concepts/file-analysis.md). With `GEMINI_MCP_BACKEND=gemini` none of this is the relay's business — the legacy Gemini CLI does its own inlining.

## Secrets

Expansion protects you. Naming a file does not.

Expanding a directory or a glob skips secret-looking files, so one broad token cannot sweep up credentials. Name `@.env` yourself and it is sent, contents and all — that is read as your deliberate choice, so make sure it is one.

Paths that leave the project are refused before a byte is read, and a refusal fails the whole call. So keep every reference relative to the project root; when Gemini genuinely needs a directory outside it, that is what `addDirs` is for. Which names count as secret, and what the jail checks, are in [Context inlining](../concepts/file-analysis.md).

## When high effort earns its cost

Reasoning effort buys thinking depth, and you pay for it in time and quota. Spend it where a wrong answer is expensive.

- **Worth it**: security audits, concurrency, cryptography, tricky algorithms, an architecture you are about to commit to. `gemini-3.1-pro-high` with `effort: "high"`.
- **Not worth it**: explaining a file, summarizing a diff, counting things, drafting a docstring. The Flash models at `-medium` or `-low`, or `effort: "low"`, answer these just as well and faster.

`gemini-plan` already runs at high effort by default, so you do not need to ask for it there.

When the Gemini quota is spent — or when you want a second opinion from a different family — `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and `gpt-oss-120b-medium` are selectable too, and they draw on a **separate quota bucket**. Run `gemini-models` for the live list and `gemini-doctor` for what is left in each bucket; the doctor call is free.

## When to reach for plan mode

`mode: "plan"` makes a run read-only. Nothing on disk changes, whatever Gemini decides it wants to do.

Use it any time you are asking a question rather than commissioning work: audits, reviews, "how would you do this", anything you are running against a repo you did not write. It costs nothing to add, and headless runs are not sandboxed — your own agy permission settings and plan mode are what hold.

`gemini-plan` is plan mode with a planner prompt around it. Reach for it when you want phases, dependencies and risks rather than prose.

## Ask for something you can check

The difference between a useful answer and a vague one is usually in the question.

- **Name the target.** "Check for SQL injection" beats "analyze this code".
- **Name the finish line.** "Refactor this to be more testable, following SOLID principles" beats "make it better". "Handle 1000 requests a second" beats "make it faster".
- **Bring the evidence.** For a bug, the full error and stack trace plus the file it names. For a performance problem, the profile.
- **Bring an example.** `@existing-service.js "create a similar service for products"` gets you house style for free.

## Threads

An `ask-gemini` reply ends with the conversation id it created or continued. Pass it back and the next question keeps the earlier answers.

The id is left off in `changeMode` and when a `jsonSchema` is set, because both bodies have to stay parseable, and `gemini-plan` and `brainstorm` never report one at all.

Resuming replays the thread's history, so it is not free. Start a new thread when the subject changes.
