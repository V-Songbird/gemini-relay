# First Steps

You ask your agent in plain language and it calls the tool. The JSON blocks show what it sends, so you can check it sent the right thing.

If you have not run `gemini-doctor` yet, do that first — [Quick Start](/getting-started) covers it.

## Ask something small

Start small, so a failure is obviously about setup and not about your prompt.

> *"Ask gemini what the difference is between a mutex and a semaphore"*

```json
{
  "name": "ask-gemini",
  "arguments": { "prompt": "In three sentences: mutex vs semaphore." }
}
```

Name a model to pick one — `gemini-3.1-pro-high`, or just `pro` or `flash`. Name none and agy answers on the model it is already set to. Add `effort` (`low`, `medium`, `high`) to change how hard it thinks.

## Point at a file

An `@` token in the prompt sends that file's contents along.

> *"Have gemini summarize @README.md"*

```json
{
  "name": "ask-gemini",
  "arguments": { "prompt": "@README.md summarize this" }
}
```

`@` also takes a folder, `@.` for the whole project, or a glob. Secrets are skipped when a folder is expanded, not when you name one: `@.env` sends the file.

Big files are cut and huge sets are dropped rather than silently half-sent. [Context Inlining](/concepts/file-analysis) has the budgets and what the reply tells you.

## Free commands

`agy` answers its own slash commands, like `/usage` and `/skills`, without a model turn — no tokens. A `/` prompt goes to the model verbatim unless you ask otherwise:

```json
{
  "name": "ask-gemini",
  "arguments": { "prompt": "/usage", "allowSlashCommands": true }
}
```

<details>
<summary><strong>For AI agents — inlining budgets, skips and slash-command gating</strong></summary>

**Model and effort.** `ask-gemini` has no default `model`: omit it and no `--model` is sent, so agy answers on its own configured model. Any id `gemini-models` lists works, as do the aliases `flash` and `pro`. `effort` is `low` | `medium` | `high`.

**What `@` resolves to.** A token that resolves to a file inside the project root is inlined before the prompt is sent, unless the file is binary, unreadable or past the budget. A directory (including `@.`) expands to the text files under it, and a glob expands to its matches.

**Which skip applies where.** Expansion skips `node_modules`, `.git`, `dist` and secret-looking files (`.env` and friends, keys, certificates). That skip is part of expansion only — a secret named directly by an `@` token is still inlined, contents and all, and sent to Gemini. The binary check is separate and applies to every file the inliner opens, named directly or reached by expansion: a NUL byte in the first 8 KB and the file is skipped.

**Budgets and footers.** A file over 256 KB is inlined up to that point and marked `TRUNCATED`. Once the 2 MB per-prompt budget is spent, the remaining files are named under an `OMITTED` marker — the first ten by name, then a count of the rest. A file that cannot be read is listed the same way under `UNREADABLE`; a binary is skipped silently, with no footer naming it. A token that resolves to nothing — or to a file that was skipped — is left in the prompt verbatim.

**Escaping the root.** References that resolve outside the project root — `..` traversal or a symlink pointing out — are rejected.

**Slash commands.** `agy` answers `/usage`, `/skills`, `/help`, `/agents`, `/model`, `/effort`, `/permissions`, `/hooks`, `/changelog`, `/config` and `/credits` itself, without a model turn. `ask-gemini` passes `--disable-slash-commands` by default — when the installed `agy` advertises that flag in its `--help`, which is how every flag the relay sends is gated — so a prompt starting with `/` goes to the model verbatim. Set `allowSlashCommands: true` to reach the command instead.

</details>

## Next

- [Context inlining](/concepts/file-analysis) — what `@` sends, in full
- [Models](/concepts/models) — the catalogue and the quota buckets
- [Prompt Recipes](/usage/natural-language) — how to phrase the request
- [Examples](/usage/examples) — real prompts that do real work
