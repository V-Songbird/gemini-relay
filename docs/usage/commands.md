# MCP Tools Reference

`gemini-relay` exposes a comprehensive suite of tools over standard MCP protocol to empower AI coding assistants.

---

## 🛠️ Tool Catalog

### 1. `ask-gemini`
Primary intelligence and analysis endpoint. Handles questions, large codebase exploration, and refactoring suggestions.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `prompt` | `string` | **Yes** | Analysis request. Supports `@src/file.ts` syntax to inline project files. |
| `model` | `string` | No | Gemini model (default: `'gemini-3.8-flash-high'`). Also accepts `'gemini-3.1-pro-high'`, `'flash'`, `'pro'`. |
| `effort` | `enum` | No | `"low"` \| `"medium"` \| `"high"` — Allocates thinking token depth. |
| `mode` | `enum` | No | `"plan"` *(read-only)* \| `"accept-edits"` *(automated editing)*. |
| `jsonSchema` | `object \| string` | No | Enforces structured JSON output conforming to this schema. |
| `addDirs` | `string[]` | No | Additional workspace directories added to context. |
| `includeUsage` | `boolean` | No | Default `false`. When `true`, returns thinking tokens and latency metrics. |
| `changeMode` | `boolean` | No | Default `false`. Outputs structured `<<<< OLD / NEW >>>>` diff blocks. |
| `sandbox` | `boolean` | No | Run in sandbox mode where supported. |

---

### 2. `gemini-plan`
Dedicated architectural planner using Gemini's plan mode (`--mode plan`) and maximum reasoning effort.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `task` | `string` | **Yes** | The architectural feature, refactor, or problem to design. |
| `context` | `string` | No | Constraints, reference files (`@file`), or requirements. |
| `model` | `string` | No | Default `'gemini-3.8-flash-high'` or `'gemini-3.1-pro-high'`. |
| `effort` | `enum` | No | Default `"high"`. Deep thinking token allocation. |
| `includeUsage` | `boolean` | No | Default `true`. Returns token and latency metrics. |

---

### 3. `gemini-image`
Generates high-definition imagery and visual assets using Google Imagen & Gemini.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `prompt` | `string` | **Yes** | Detailed visual description (subject, lighting, composition, style). |
| `aspectRatio` | `enum` | No | `'1:1'` *(default)*, `'16:9'`, `'9:16'`, `'4:3'`, `'3:4'`, `'3:2'`, `'2:3'`. |
| `outputPath` | `string` | No | Relative project workspace path to automatically save the image (e.g. `'assets/hero.png'`). |

---

### 4. `gemini-models`
Introspects available Gemini models, default selections, reasoning tiers, and active backend capabilities.
- **Parameters:** None (`{}`)

---

### 5. `gemini-doctor`
Diagnoses your environment, detecting installed CLIs (`agy` / `gemini`), versions, and system readiness.
- **Parameters:** None (`{}`)

---

### 6. `brainstorm`
Structured creative ideation engine utilizing established design frameworks (SCAMPER, Design Thinking, Lateral Thinking, Divergent/Convergent).

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `prompt` | `string` | **Yes** | Core challenge or topic to explore. |
| `methodology` | `enum` | No | `'divergent'` \| `'convergent'` \| `'scamper'` \| `'design-thinking'` \| `'lateral'` \| `'auto'`. |
| `effort` | `enum` | No | Reasoning effort level (`"low"`, `"medium"`, `"high"`). |
| `domain` | `string` | No | Target domain (e.g. `'software'`, `'security'`). |
| `ideaCount` | `number` | No | Default `12`. Number of concepts to generate. |

---

### 7. `fetch-chunk`
Retrieves subsequent paginated chunks from large multi-file edit suggestions generated during `changeMode`.
- **Parameters:** `cacheKey` (string), `chunkIndex` (number).

---

### 8. `ping` & `Help`
- `ping`: Verifies server connection and echo latency.
- `Help`: Retrieves the active CLI backend's official help manual.