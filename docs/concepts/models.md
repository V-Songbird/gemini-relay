# Supported Models & Reasoning Controls

`gemini-relay` connects your AI agents directly to Google's latest **Gemini 3.8** and **Gemini 3.1** model family via the **Antigravity CLI (`agy`)** backend.

---

## 🌟 Available Model Family

| Model Identifier | Alias | Best For | Reasoning Depth | Speed |
| :--- | :--- | :--- | :--- | :--- |
| `gemini-3.8-flash-high` | `flash` | **Default choice.** Code review, large refactoring, Q&A, and fast planning. | Deep | Ultra-Fast (~2-4s) |
| `gemini-3.8-flash-medium` | - | Everyday tasks with balanced reasoning depth. | Medium | Ultra-Fast (~1-3s) |
| `gemini-3.8-flash-low` | - | High-throughput summaries, syntax checks, formatting. | Low | Instant (<1s) |
| `gemini-3.1-pro-high` | `pro` | **Deep architectural reasoning.** Algorithm design, math proofs, security boundary audits. | Maximum Flagship | Moderate (~5-10s) |
| `gemini-3.1-pro-low` | - | Pro-grade knowledge retrieval with minimal thinking delay. | Low | Fast (~2-4s) |
| `gemini-3.7-flash-high` | - | Previous generation high-reasoning flash model. | High | Fast |

---

## 🧠 Reasoning Effort Depth

You can control thinking token allocation dynamically on any query by passing the `effort` parameter:

```typescript
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "Audit @src/security.ts for subtle timing attacks and side-channel leakage.",
    "model": "gemini-3.1-pro-high",
    "effort": "high",
    "includeUsage": true
  }
}
```

- **`effort: "high"`**: Allocates maximum reasoning tokens for rigorous edge-case analysis, distributed systems design, or security audits.
- **`effort: "medium"`**: Standard balanced reasoning for refactoring and feature implementation.
- **`effort: "low"`**: Minimal thinking overhead for instant summaries, code classification, and translation.

---

## 📋 Discovering Available Models

You can ask your agent to inspect available models at any time using the [`gemini-models`](/usage/commands#gemini-models) tool:

> *"Run gemini-models to see what Gemini models and reasoning options are available."*