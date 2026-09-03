# Gemini Relay — Agent Integration & Capability Guide

> **Target Audience:** Autonomous coding agents (Claude Code, Cursor, Windsurf, Codex, etc.), orchestrators, and developers configuring agentic pair-programming workflows.

---

## 1. Executive Overview: Why Agents Should Use This Server

`gemini-relay` connects your agentic runtime directly to Google's **Gemini 3.8 Flash** and **Gemini 3.1 Pro** engines via the modern **Antigravity CLI** (`agy`) backend (and legacy `gemini` CLI).

### Core Superpowers for AI Agents:
1. **Massive Context Window Offloading (Save Your Own Context)**:
   Instead of cluttering your own context window with hundreds of thousands of tokens of source files, dependency trees, or build logs, pass them to Gemini via `@file` or `@.` syntax. Gemini inspects the raw data and returns a concise, high-signal summary or solution directly to you.
2. **Deep Dual-Model Thinking & Second Opinions**:
   Two heads are better than one. Use `gemini-plan` or `ask-gemini` with `effort: "high"` to verify complex algorithmic logic, check for subtle race conditions, or critique architectural blueprints before writing code.
3. **Structured Machine-Readable Output**:
   Pass a `jsonSchema` to enforce valid, strongly-typed JSON responses from Gemini that your agent code can parse reliably with `JSON.parse()`.
4. **Structured Multi-File Refactoring**:
   Use `changeMode: true` to receive deterministically parsed `<<<< OLD / ==== / >>>> NEW` code blocks with automatic caching and chunking for massive diffs.

---

## 2. Complete Tool Catalog & Schemas

### Tool 1: `ask-gemini`
**Category:** General Analysis, Reasoning & Code Edits  
**Description:** Query Gemini with file inlining, reasoning effort controls, agent execution modes, and optional structured JSON schema enforcement.

#### Input Schema:
```typescript
{
  prompt: string;           // Required: Analysis request. Supports "@file.ts" syntax to inline local files.
  model?: string;           // Optional: Model identifier or alias (Default: 'gemini-3.8-flash-high').
                            // Options: 'gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low',
                            //          'gemini-3.1-pro-high', 'gemini-3.1-pro-low', 'gemini-3.7-flash-high',
                            //          or aliases: 'pro', 'flash'.
  effort?: "low" | "medium" | "high"; // Optional: Thinking token depth for reasoning models.
  mode?: "accept-edits" | "plan";     // Optional: 'plan' for read-only analysis; 'accept-edits' for automated editing.
  jsonSchema?: string | object;       // Optional: Enforce structured JSON conforming to this schema.
  addDirs?: string[];                 // Optional: Directories added to the workspace context.
  conversationId?: string;            // Optional: Resume or attach to a specific session ID.
  includeUsage?: boolean;             // Optional (default false): Append token counts and timing metrics.
  changeMode?: boolean;               // Optional (default false): Output structured OLD/NEW edit suggestions.
  chunkIndex?: number | string;       // Optional: 1-based index to retrieve paginated diff chunks.
  chunkCacheKey?: string;             // Optional: 8-character hex cache key for multi-chunk retrieval.
  sandbox?: boolean;                  // Optional (default false): Run in isolated sandbox if supported.
}
```

#### Return Format:
- Normal mode: Plain markdown text prefixed with `Gemini response:\n`.
- Structured output (`jsonSchema`): Valid JSON string.
- Change mode (`changeMode: true`): Formatted diff blocks with file summary header and optional `fetch-chunk` continuation metadata.

---

### Tool 2: `gemini-plan`
**Category:** Architecture & Implementation Blueprints  
**Description:** Dedicated architectural planner powered by Gemini's deep reasoning and `--mode plan`. Generates phased implementation blueprints, dependency analysis, edge case identification, and risk assessments without modifying any code.

#### Input Schema:
```typescript
{
  task: string;                       // Required: Feature, refactor, or architectural problem to plan.
  context?: string;                   // Optional: Requirements, constraints, or reference files (supports @file).
  model?: string;                     // Optional: Default 'gemini-3.8-flash-high' (or 'gemini-3.1-pro-high').
  effort?: "low" | "medium" | "high"; // Optional (default 'high'): Deep thinking token allocation.
  addDirs?: string[];                 // Optional: Workspace directories for project context.
  includeUsage?: boolean;             // Optional (default true): Append thinking/token metrics.
}
```

#### When Claude Code / Agents Should Use `gemini-plan`:
- Before starting any multi-file feature or breaking refactor.
- When designing database schemas, state management architectures, or API contracts.
- When an agent is unsure of the optimal sequencing of code changes.

---

### Tool 3: `gemini-models`
**Category:** Introspection & Discovery  
**Description:** Introspects available Gemini models, default selections, reasoning capabilities, and active backend status.

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
- Mode support status (`✅ Supported`).
- Full list of available model IDs and labels.

---

### Tool 4: `gemini-doctor`
**Category:** Diagnostics & Health Check  
**Description:** Verifies CLI installation paths (`agy.exe` and `gemini.cmd`), versions, active backend selection, Node runtime, and OS environment.

#### Input Schema:
```typescript
{} // No arguments required
```

#### When to Use:
- When a tool call returns an unexpected execution failure.
- During initial session preflight to verify that the environment is fully operational.

---

### Tool 5: `brainstorm`
**Category:** Ideation & Exploration  
**Description:** Multi-framework brainstorming engine leveraging SCAMPER, Design Thinking, Lateral Thinking, and Divergent/Convergent ideation frameworks with reasoning controls.

#### Input Schema:
```typescript
{
  prompt: string;           // Required: Core challenge or topic to explore.
  model?: string;           // Optional: Model (default 'gemini-3.8-flash-high').
  effort?: "low" | "medium" | "high"; // Optional: Reasoning effort.
  methodology?: "divergent" | "convergent" | "scamper" | "design-thinking" | "lateral" | "auto"; // Default 'auto'
  domain?: string;          // Optional: e.g. 'software', 'security', 'marketing', 'creative'.
  constraints?: string;     // Optional: Constraints, budget, latency limits, tech stack.
  existingContext?: string; // Optional: Previous attempts or current state.
  ideaCount?: number;       // Optional (default 12): Number of ideas to generate.
  includeAnalysis?: boolean;// Optional (default true): Feasibility and impact ratings.
}
```

### Tool 6: `gemini-image`
**Category:** Multimodal Asset Generation  
**Description:** Generate images using Google Gemini & Imagen directly from text descriptions. Supports aspect ratio selection and automatic copying/saving into your project directory.

#### Input Schema:
```typescript
{
  prompt: string;         // Required: Detailed visual description of the image to create.
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3"; // Optional (default '1:1')
  outputPath?: string;    // Optional: Relative project workspace file path (e.g. 'assets/hero.jpg').
}
```

---

### Tool 7: `fetch-chunk`
**Category:** Pagination & Diff Retrieval  
**Description:** Fetches a specific chunk of multi-file edit suggestions generated during a `changeMode` call that exceeded chunk size thresholds.

#### Input Schema:
```typescript
{
  cacheKey: string;   // Required: 8-character hex key returned by ask-gemini.
  chunkIndex: number; // Required: 1-based chunk index to retrieve.
}
```

---

### Tools 8 & 9: `ping` and `Help`
- `ping`: Echoes a message back to verify server liveness and latency.
- `Help`: Retrieves the active backend's official CLI command line help manual.

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
*Response format:*
```
<<<< OLD: src/utils/commandExecutor.ts
// existing code
====
// new code with AbortController
>>>>
```

---

## 4. Key Best Practices & Tips for Agents

### DO:
- ✅ **Use `@file` References**: Use `@src/path/to/file.ts` rather than pasting entire file contents into the prompt string. The server safely checks the project root boundary and inlines the content with clear file boundary markers.
- ✅ **Leverage `effort: "high"` for Complex Logic**: When auditing security, concurrency, math algorithms, or architectural designs, specify `effort: "high"`. For simple queries or summaries, use `effort: "low"` for maximum speed.
- ✅ **Request `includeUsage: true` for Performance Tracking**: Check how many `thinking_tokens` were used to evaluate reasoning depth.
- ✅ **Run `gemini-doctor` on Failures**: If an error occurs, run `gemini-doctor` to immediately detect if an auth session expired, PATH changed, or a binary was uninstalled.

### DO NOT:
- ❌ **Do Not Manually Inline Files That `@` Can Handle**: Don't waste your own output tokens reading files with `cat` and pasting them into the `ask-gemini` prompt; simply reference them with `@filepath`.
- ❌ **Do Not Reference Files Outside the Project Root**: The server enforces a strict project root jail for security (guarding against directory traversal attacks like `@../../etc/passwd`). Keep file paths relative to the current workspace root.
- ❌ **Do Not Pass Huge Binary Files**: Use `@` for text, code, JSON, YAML, markdown, and log files. Avoid passing compiled binaries, images, or minified bundle blobs.

---

## 5. Model Selection Guide

| Model Identifier | Alias | Best For | Reasoning Strength | Speed |
| :--- | :--- | :--- | :--- | :--- |
| `gemini-3.8-flash-high` | `flash` | **Default choice for 95% of tasks.** Code analysis, refactoring, Q&A, and fast planning. | Deep | Ultra-Fast |
| `gemini-3.8-flash-medium` | - | Moderate complexity tasks requiring balanced speed and reasoning. | Medium | Ultra-Fast |
| `gemini-3.8-flash-low` | - | High-throughput summaries, syntax conversions, or classification. | Low | Instant |
| `gemini-3.1-pro-high` | `pro` | **Deep architectural reasoning.** Math proofs, complex distributed algorithms, exhaustive edge case analysis. | Maximum Flagship | Moderate |
| `gemini-3.1-pro-low` | - | Heavy pro-grade knowledge base lookups with minimal thinking delay. | Low | Fast |
| `gemini-3.7-flash-high` | - | Previous generation high-reasoning flash model. | High | Fast |

---

## 6. Environment & Backend Configuration Reference

| Environment Variable | Allowed Values | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `GEMINI_MCP_BACKEND` | `agy`, `antigravity`, `gemini` | `agy` | Selects which CLI engine executes prompts. |
| `AGY_CLI_PATH` | File path string | Auto-probed | Full path to `agy` or `agy.exe` binary. |
| `GEMINI_CLI_PATH` | File path string | Auto-probed | Full path to legacy `gemini` executable. |
| `GEMINI_MCP_TIMEOUT` | Integer (minutes) | `45` | Maximum total time allowed for a child process before timeout kill. |
| `AGY_PRINT_TIMEOUT` | Duration string (e.g. `10m`, `44m`) | Derived | Value forwarded to `agy --print-timeout`. |

---

## 7. Troubleshooting Quick Reference

| Symptom | Probable Cause | Instant Solution |
| :--- | :--- | :--- |
| `Command failed: Could not find "agy"` | `agy` binary not in standard PATH or `%LOCALAPPDATA%`. | Set `AGY_CLI_PATH` in MCP server config or run `curl -fsSL https://antigravity.google/cli/install.sh \| bash`. |
| `Exit code 1: login expired / auth failed` | CLI session credentials expired. | Run `agy` once in terminal to complete interactive Google authentication. |
| `File outside project directory` | Path passed to `@` escapes project root (e.g. `@../secret`). | Pass path relative to workspace root without parent traversal `..`. |
| `Backend ... ignores model selection` | Using legacy backend or outdated build. | Switch to `GEMINI_MCP_BACKEND=agy` which supports full model selection. |
