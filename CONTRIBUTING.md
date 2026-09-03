# Contributing to Gemini MCP Tool

Thanks for your interest in contributing! This project welcomes issues and pull requests.

## Reporting issues

- Search [existing issues](https://github.com/V-Songbird/gemini-mcp-tool/issues) first.
- Include your OS, Node.js version, Gemini CLI version, and MCP client
  (Claude Code, Claude Desktop, etc.), plus exact error output if any.

## Development setup

```bash
git clone https://github.com/V-Songbird/gemini-mcp-tool.git
cd gemini-mcp-tool
npm install
npm run build
npm test
```

Useful scripts:

- `npm run dev` — build and run the server locally
- `npm run test:unit` / `npm run test:integration` — targeted test runs
- `npm run lint` — type-check the codebase
- `npm run docs:dev` — preview the docs site locally

## Pull requests

- For significant changes, open an issue first so we can discuss the approach.
- Keep PRs focused — one fix or feature per PR.
- Add or update tests for behavior changes.
- Make sure `npm test` and `npm run lint` pass before submitting.

## Documentation

Docs live in `docs/` and are published at
[V-Songbird.github.io/gemini-mcp-tool](https://V-Songbird.github.io/gemini-mcp-tool/). Doc fixes are always welcome.

