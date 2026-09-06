# Supported Models & Reasoning Controls

The Antigravity CLI (`agy`) serves the **Gemini 3.8 / 3.7 / 3.6 Flash** families and **Gemini 3.1 Pro**, plus three models that are not Gemini at all and sit on their own quota.

This page lists what you can pass as `model`, and what `effort` does on top of it. Run `gemini-models` for the live list from your own install — a written list can go stale, that one cannot.

## Which model runs when you name none

There is no default. `ask-gemini` and `brainstorm` send no `--model` flag at all when you leave `model` unset, so agy answers on whatever model it is itself configured to use.

Two tools differ. `gemini-plan` pins `gemini-3.8-flash-high` when you name none. `gemini-image` has no `model` parameter at all.

## The models you can name

Pass any of these as `model` to `ask-gemini`, `gemini-plan` or `brainstorm`.

| Model Identifier | Alias | Best For |
| :--- | :--- | :--- |
| `gemini-3.8-flash-high` | `flash` | **The usual pick.** Code review, large refactoring, Q&A, and planning. |
| `gemini-3.8-flash-medium` | - | Everyday tasks with balanced reasoning depth. |
| `gemini-3.8-flash-low` | - | Summaries, syntax checks, formatting. |
| `gemini-3.7-flash-high` | - | Previous generation, high reasoning. |
| `gemini-3.7-flash-medium` | - | Previous generation, balanced. |
| `gemini-3.7-flash-low` | - | Previous generation, minimal thinking. |
| `gemini-3.6-flash-high` | - | Older generation, kept for reproducing earlier results. |
| `gemini-3.6-flash-medium` | - | Older generation, balanced. |
| `gemini-3.6-flash-low` | - | Older generation, minimal thinking. |
| `gemini-3.1-pro-high` | `pro` | **Deep architectural reasoning.** Algorithm design, math proofs, security boundary audits. |
| `gemini-3.1-pro-low` | - | Pro-grade knowledge retrieval with minimal thinking. |

## Non-Gemini models

`agy` also serves three models that are not Gemini, and they are billed against a **separate quota bucket**. Gemini quota being spent does not stop them, and vice versa.

| Model Identifier | Notes |
| :--- | :--- |
| `claude-opus-4-6-thinking` | Extended-thinking Claude Opus. |
| `claude-sonnet-4-6` | Claude Sonnet. |
| `gpt-oss-120b-medium` | Open-weights GPT-OSS 120B. |

They take the same `model` parameter as everything else:

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "@src/backends/agy.ts review the fallback ladder",
    "model": "claude-opus-4-6-thinking",
    "mode": "plan"
  }
}
```

## Reasoning effort

Two things control thinking depth, and they are independent.

One is the `-high` / `-medium` / `-low` suffix baked into the model id. The other is the `effort` parameter, which the relay forwards to agy as `--effort` — but only when the installed build advertises that flag, which is the rule for every flag the relay sends. The relay does not reconcile the two: set both and agy decides.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Audit @src/utils/geminiExecutor.ts for path traversal and symlink escapes.",
    "model": "gemini-3.1-pro-high",
    "effort": "high",
    "includeUsage": true
  }
}
```

- **`effort: "high"`**: maximum reasoning tokens, for rigorous edge-case analysis, distributed systems design, or security audits.
- **`effort: "medium"`**: balanced reasoning for refactoring and feature implementation.
- **`effort: "low"`**: minimal thinking overhead for summaries, classification, and translation.

`ask-gemini` and `brainstorm` send no `--effort` unless you pass one; `gemini-plan` defaults to `"high"`. The parameter is documented for the Gemini 3.8 Flash, 3.7 Flash and 3.1 Pro families.

Pass `includeUsage: true` to get the input, output and thinking token counts back with the answer. It is deliberately ignored when you also set a `jsonSchema`: the structured body is what you run `JSON.parse` on, and a trailing `📊 [Tokens: …]` line would make it unparseable.

## Finding out what you can reach

The [`gemini-models`](/usage/commands) tool asks the CLI itself (`agy --output-format json models`) and prints what came back, alongside the active backend's capabilities:

> *"Run gemini-models to see what models and reasoning options are available."*

For quota, [`gemini-doctor`](/usage/commands) runs `agy -p "/usage" --output-format json`, which agy's command layer answers without a model turn and therefore costs no tokens. It reports each quota group with the percentage left and its reset time, which is where the split between the Gemini bucket and the Claude/GPT bucket is visible.

<details>
<summary><strong>For AI agents — aliases, the offline list, and the legacy backend</strong></summary>

**Aliases.** Only two targets exist, and the relay resolves the id before it reaches agy:

- `flash`, `gemini-flash`, `gemini-3.8-flash` → `gemini-3.8-flash-high`
- `pro`, `gemini-pro`, `gemini-3.1-pro` → `gemini-3.1-pro-high`

The retired `gemini-2.5-flash` and `gemini-3.5-flash` ids resolve to the first, and `gemini-2.5-pro` to the second, so an old call does not break — but they are no longer models you can reach on this backend.

**When the live query fails.** The backend runs `agy --output-format json models`; if that call fails or comes back empty it returns a built-in list of eight ids instead — `gemini-3.8-flash-high`, `gemini-3.8-flash-medium`, `gemini-3.8-flash-low`, `gemini-3.7-flash-high`, `gemini-3.7-flash-medium`, `gemini-3.7-flash-low`, `gemini-3.1-pro-high` and `gemini-3.1-pro-low`. A list with no 3.6 Flash and no non-Gemini models in it therefore means the live query did not answer, not that the other models are gone.

**The legacy Gemini backend.** With `GEMINI_MCP_BACKEND=gemini` the relay drives the retired Gemini CLI instead. That backend offers only `gemini-2.5-pro` and `gemini-2.5-flash`, and supports no reasoning effort, no `--json-schema` and no execution modes — `runWithBackend` drops those arguments and says so in a `⚠️` notice rather than silently ignoring them. The automatic Pro-to-Flash retry on a quota error also lives only there; on agy a quota error is surfaced verbatim instead.

</details>
