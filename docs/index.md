---
layout: home

hero:
  name: "Gemini Relay"
  text: "Hand the big reading to Gemini"
  tagline: "Your agent's context window is the thing you run out of first. Gemini Relay sends the reading to Google Gemini through the Antigravity CLI, and hands your agent back the answer instead of the files."
  actions:
    - theme: brand
      text: Quick Start
      link: /getting-started
    - theme: alt
      text: Agent Reference Guide
      link: /AGENT_GUIDE
    - theme: alt
      text: GitHub Repo
      link: https://github.com/V-Songbird/gemini-relay

features:
  - icon: ⚡
    title: Pick a model, or don't
    details: Ask for Gemini 3.8 Flash, Gemini 3.1 Pro, or just say 'flash' or 'pro'. Give ask-gemini or brainstorm no model and agy answers on the model it is already set to.
  - icon: 🧠
    title: Choose how hard it thinks
    details: Set effort to 'low', 'medium' or 'high' on any one question, and pay for deep thinking only where it earns its keep.
  - icon: 🏗️
    title: A plan before you write
    details: gemini-plan reads the project and returns a phased implementation plan. It runs in plan mode, so it changes nothing.
  - icon: 🎨
    title: Images from a description
    details: gemini-image makes an asset at the aspect ratio and size you ask for, and writes it into your workspace when you give it a path.
  - icon: 📐
    title: JSON your code can parse
    details: Pass a jsonSchema and it goes to agy as --json-schema, so the reply comes back structured with nothing to repair.
  - icon: 📂
    title: Files your agent never opens
    details: Point at a file, a folder, or the whole project with @, and Gemini does the reading.
---

<div style="margin-top: 56px; margin-bottom: 24px;">

## Try it before you install

Four things a coding agent asks the relay to do, and what comes back.

</div>

<GeminiPlayground />

<div style="margin-top: 64px; margin-bottom: 24px;">

## How hard it thinks

`low`, `medium` and `high` side by side, and when each one is worth it.

</div>

<ReasoningVisualizer />

<div style="margin-top: 64px; margin-bottom: 24px;">

## The models you can name

</div>

<ModelMatrix />

Gemini 3.7 and 3.6 Flash are still nameable too, in high, medium and low. The same `agy` backend also serves `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and `gpt-oss-120b-medium`; pass any of them as `model`. They draw on a quota bucket separate from the Gemini models. [Models](/concepts/models) lists every id.

Ready? [Quick Start](/getting-started) has the whole install in three steps.
