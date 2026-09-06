# Sandbox Mode

`sandbox` is a boolean parameter on `ask-gemini`, off by default. It asks the CLI to run sandboxed; it is not an isolation layer the relay provides.

On the default `agy` backend it isolates nothing, and the reply says so. This page is about what does protect you instead.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "write and run a quicksort, then show the output",
    "sandbox": true
  }
}
```

## What it does on each backend

| Backend | Flag sent | What the relay claims |
| :--- | :--- | :--- |
| `agy` (default) | `--sandbox` | Nothing. The backend declares that it does **not** isolate tool execution in headless mode. |
| `gemini` (legacy) | `-s` | The Gemini CLI's own sandbox; that backend declares tool execution isolated. |

On agy, `runWithBackend` sees the request against a backend whose `sandboxIsolatesToolExecution` is `false` and prefixes the reply with a notice:

> ⚠️ Backend "agy" does not isolate tool execution in headless mode; the sandbox request cannot be guaranteed.

The reason is in the backend source: `-p` runs tools with your own privileges. `gemini-models` reports the same thing as **Tool Sandbox: ⚠️ Host-executed in headless**.

Whatever restrictions the installed `agy` applies to `--sandbox` are agy's own. The relay neither implements nor verifies them, so do not treat `sandbox: true` as a reason to run something you would not run yourself.

## What actually protects you

Two things, and neither is the `sandbox` parameter.

**The project-root jail, on the way in.** Every `@` reference in a prompt is resolved, canonicalized and rejected if it lands outside the project root — symlinks included — before a single byte is read. Directory and glob expansion additionally skips `node_modules`, `.git`, `dist` and secret-looking files. See [Context Inlining](/concepts/file-analysis).

The jail governs what the relay inlines, not what the agent then does. agy's own tools read and write under the permission settings in `~/.gemini/antigravity-cli/settings.json`, which may allow paths outside the project root.

**agy's own permission settings, on the way out.** Since agy 1.1.5, headless runs honour the permission settings persisted on your machine: a tool call those settings do not allow is refused, with nobody there to approve it.

The relay surfaces those refusals rather than swallowing them. A run that had actions denied comes back with a notice naming them, so an edit that never happened does not read as success.

`skipPermissions: true` gives that up deliberately, and only on a build that advertises `--dangerously-skip-permissions`. If the installed agy does not advertise that flag, or the `--help` probe failed, it is dropped and the persisted permission settings still apply — see [How It Works](/concepts/how-it-works).

## Practical advice

If you need code executed under real isolation, run it yourself in a container and hand the output to Gemini. If you only need the code *written* and reasoned about without anything being touched, that is what `mode: "plan"` is for — it is read-only by design, and it is what [`gemini-plan`](/usage/commands) uses.

```json
{
  "name": "ask-gemini",
  "arguments": {
    "prompt": "@src/data-processor.ts this is slow — how would you optimize it?",
    "mode": "plan"
  }
}
```
