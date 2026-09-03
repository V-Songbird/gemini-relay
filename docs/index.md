---
layout: home

hero:
  name: "Gemini Relay"
  text: "Google Gemini 3.8 & Antigravity for AI Agents"
  tagline: "Unleash Google's Gemini 3.8 Flash, Gemini 3.1 Pro, reasoning depth, and Imagen multimodal generation directly inside Claude Code, Cursor, and autonomous agent workflows."
  actions:
    - theme: brand
      text: Quick Start →
      link: /getting-started
    - theme: alt
      text: 🤖 Agent Reference Guide
      link: /AGENT_GUIDE
    - theme: alt
      text: GitHub Repo ⭐
      link: https://github.com/V-Songbird/gemini-relay

features:
  - icon: ⚡
    title: Gemini 3.8 Flash by Default
    details: Instantaneous response latency coupled with deep multi-step thinking tokens via gemini-3.8-flash-high.
  - icon: 🧠
    title: Dynamic Reasoning Depth
    details: Dial thinking token depth up or down on demand with effort controls ('low', 'medium', 'high') per query.
  - icon: 🏗️
    title: Architectural Blueprints (gemini-plan)
    details: Non-destructive phased implementation roadmaps and dependency risk assessments using Gemini's dedicated plan mode.
  - icon: 🎨
    title: Multimodal Visual Creation (gemini-image)
    details: Generate application assets and illustrations from text descriptions with aspect ratio control and automatic project export.
  - icon: 📐
    title: Guaranteed JSON Schemas
    details: Enforce valid machine-readable JSON matching any user-provided schema for zero-friction agent parsing.
  - icon: 📂
    title: Zero-Overhead Context Inlining
    details: Offload 1M-2M tokens of code and logs via @file syntax, keeping your primary agent's context clean and hyper-focused.
---

<div style="margin-top: 56px; margin-bottom: 24px;">

## 🎮 Interactive Agent Console

Experience how Claude Code interacts with `gemini-relay` in real-time across architectural planning, large context inlining, visual generation, and structured outputs.

</div>

<GeminiPlayground />

<div style="margin-top: 64px; margin-bottom: 24px;">

## 🧠 Reasoning Effort Depth Engine

Explore the thinking token budgets available across Gemini 3.8 Flash and Gemini 3.1 Pro.

</div>

<ReasoningVisualizer />

<div style="margin-top: 64px; margin-bottom: 24px;">

## 🌟 Supported Gemini 3.8 & 3.1 Model Matrix

</div>

<ModelMatrix />

<div style="margin-top: 64px; margin-bottom: 24px;">

## ⚡ One-Line Setup for Claude Code

</div>

Add the MCP server to your local Claude Code instance in seconds:

```bash
claude mcp add gemini-relay -- npx -y gemini-relay
```

Verify your setup at any time by asking Claude:
> *"Run gemini-doctor to check the status of the MCP server and active backend"*
