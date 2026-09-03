# Changelog

All notable changes to **Gemini Relay** will be documented in this file.

## [1.2.0] - 2026-09-03

### Initial Modern Release
- **Gemini 3.8 Flash & Gemini 3.1 Pro Support**: Native integration with Google's latest model family (`gemini-3.8-flash-high`, `gemini-3.8-flash-medium`, `gemini-3.8-flash-low`, `gemini-3.1-pro-high`, `gemini-3.1-pro-low`).
- **Antigravity CLI (`agy`) Primary Engine**: Full headless execution via Google's modern Antigravity CLI with automatic model selection, JSON streaming, and session continuity.
- **Multimodal Image Generation (`gemini-image`)**: Generate high-definition visual assets directly from prompts with aspect ratio control and automatic project export.
- **Architectural Planning (`gemini-plan`)**: Dedicated non-destructive planning tool utilizing Gemini's plan mode (`--mode plan`) and maximum reasoning effort for phased implementation blueprints.
- **Reasoning Effort Control**: Fine-tune thinking token depth with `effort: "low" | "medium" | "high"` across queries and ideation tasks.
- **Guaranteed Structured Output (`jsonSchema`)**: Enforce valid, machine-readable JSON matching any user-provided schema for automated agent workflows.
- **Model Discovery (`gemini-models`)**: Real-time capability matrix and model introspection tool.
- **Environment Diagnostics (`gemini-doctor`)**: Comprehensive health-check tool verifying CLI binaries, versions, authentication, and execution environment.
- **Structured Multi-File Refactoring (`changeMode`)**: Automatic `<<<< OLD / NEW >>>>` diff formatting with paginated chunk caching for massive codebases.
- **Cross-Platform Process Hardening**: Direct binary execution on Windows bypassing `cmd.exe` multiline prompt corruption and command-line length limits.
- **Project Jail Security Guard**: Strict root confinement for `@file` and `@dir` references preventing path traversal attacks.
