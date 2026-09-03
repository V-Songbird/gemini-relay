# CLAUDE.md — Agent System & Development Instructions

> **Note for Claude Code:** This file provides runtime instructions for developing, testing, and using `gemini-mcp-tool`. Read `docs/AGENT_GUIDE.md` for complete architectural recipes and advanced usage patterns.

---

## 🤖 When Working as a Pair Programmer with this MCP Server

When the `gemini-cli` MCP server is connected to your environment, you have access to Google Gemini's **Gemini 3.8 Flash** and **Gemini 3.1 Pro** engines. Use them strategically:

### Core Delegation Strategy
1. **Conserve Your Own Context Window**:
   - When asked to analyze multiple large files or entire directory trees, do NOT read them all into your own context.
   - Instead, call `ask-gemini` with `@file1 @file2` or `@.` and let Gemini process the large token volume, returning only the synthesized answer to you.
2. **Deep Architectural Planning with `gemini-plan`**:
   - Before executing large multi-file refactors or designing new microservices, call `gemini-plan(task: "...", effort: "high")`.
   - Take the resulting phased plan and execute it step-by-step using your standard editing and terminal tools.
3. **Second Opinions on Complex Algorithms / Security**:
   - Call `ask-gemini` with `model: "gemini-3.1-pro-high"` and `effort: "high"` to audit critical security boundaries, cryptography, or concurrency primitives.
4. **Structured JSON Output**:
   - When you need parseable data (e.g. dependency audits, AST metrics, error classifications), pass a `jsonSchema` object to `ask-gemini` so you can call `JSON.parse()` on the response directly.
5. **System Health Check**:
   - If a Gemini tool call fails unexpectedly, invoke `gemini-doctor` to inspect CLI binary status (`agy` / `gemini`), version, and auth session.

---

## 🛠️ MCP Tool Reference Summary

| Tool | Primary Purpose | Key Parameters |
| :--- | :--- | :--- |
| `ask-gemini` | Core query & file analysis engine | `prompt` (supports `@file`), `model`, `effort`, `mode`, `jsonSchema`, `includeUsage`, `changeMode` |
| `gemini-plan` | Deep architectural planner (read-only) | `task`, `context`, `model`, `effort: "high"`, `includeUsage` |
| `gemini-image` | Multimodal asset & image generation | `prompt`, `aspectRatio`, `outputPath` |
| `gemini-models`| Discover available models & backend | None |
| `gemini-doctor`| Environment & CLI health check | None |
| `brainstorm` | Multi-methodology creative ideation | `prompt`, `methodology`, `domain`, `ideaCount`, `effort` |
| `fetch-chunk`| Retrieve paginated diff chunks | `cacheKey`, `chunkIndex` |
| `ping` | Latency / echo test | `prompt` |
| `Help` | Official active CLI manual | None |

---

## 🧑‍💻 Development & Contribution Commands for this Repo

If you are modifying or extending this MCP server codebase:

```bash
# Verify environment and CLI detection
npm run doctor

# Type-check TypeScript codebase and tests
npm run lint

# Compile TypeScript to dist/
npm run build

# Run entire test suite (unit + integration + e2e)
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

### Architecture Constraints
- **Active Backend**: Defaults to Antigravity CLI (`agy`), falling back to `gemini` for enterprise setups.
- **Process Spawning**: Direct `.exe` binaries on Windows (`agy.exe`) must be spawned with `shell: false` to avoid `cmd.exe` multiline newline corruption and the 8,191-character argument length ceiling.
- **File Reference Security**: Any `@file` reference must be validated by `assertSafeFileReferences()` to guarantee that resolved paths remain strictly within the workspace root directory.
