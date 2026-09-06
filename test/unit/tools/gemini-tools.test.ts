import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getToolDefinitions,
  toolExists,
  executeTool,
} from "../../../src/tools/index.js";
import { MODELS } from "../../../src/constants.js";
import { formatUsageReport, formatDoctorReport } from "../../../src/tools/gemini-doctor.tool.js";

describe("Tools: gemini-plan", () => {
  test("gemini-plan is registered in toolRegistry", () => {
    assert.equal(toolExists("gemini-plan"), true);
    const defs = getToolDefinitions();
    const plan = defs.find((d) => d.name === "gemini-plan");
    assert.ok(plan);
    assert.equal(plan.name, "gemini-plan");
    assert.ok(plan.description?.includes("Architectural"));
    const props = plan.inputSchema.properties as Record<string, unknown>;
    assert.ok(props.task);
    assert.ok(props.effort);
    assert.ok((plan.inputSchema.required as string[]).includes("task"));
  });

  test("gemini-plan throws error when task is missing or empty", async () => {
    await assert.rejects(
      executeTool("gemini-plan", {} as any),
      /task/i
    );
  });
});

describe("Tools: gemini-models", () => {
  test("gemini-models is registered in toolRegistry", () => {
    assert.equal(toolExists("gemini-models"), true);
    const defs = getToolDefinitions();
    const modelsTool = defs.find((d) => d.name === "gemini-models");
    assert.ok(modelsTool);
  });

  test("gemini-models execute returns formatted models list", async () => {
    const result = await executeTool("gemini-models", {});
    assert.ok(typeof result === "string");
    assert.match(result, /Active Backend:/);
    assert.match(result, /Available Models:/);
    assert.match(result, /gemini-3\.8-flash/);
  });
});

describe("Tools: gemini-doctor", () => {
  test("gemini-doctor is registered in toolRegistry", () => {
    assert.equal(toolExists("gemini-doctor"), true);
    const defs = getToolDefinitions();
    const doctorTool = defs.find((d) => d.name === "gemini-doctor");
    assert.ok(doctorTool);
  });

  // `execute` spawns `agy --version` and, on an agy backend, `agy -p /usage`,
  // which is a live round trip to Google's quota service — neither belongs in
  // the unit category ("No subprocess, no network, no real CLI"). The real
  // execution path is covered by test/e2e/server.e2e.test.ts; everything below
  // exercises the pure renderers with live-captured fixtures instead.

  // Payload shape verified live against agy 1.1.27: two groups, a weekly and a
  // 5h bucket each, under command.data.groups, with a top-level status.
  const usageJson = (fractions: [number, number, number], status = "SUCCESS") => JSON.stringify({
    status,
    command: {
      name: "usage",
      data: {
        groups: [
          {
            name: "Gemini Models",
            description: "Gemini 3.x",
            buckets: [
              { id: "gemini-weekly", name: "Weekly", window: "7d", remaining_fraction: fractions[0], reset_time: "2026-09-10T18:41Z" },
              { id: "gemini-5h", name: "5-hour", window: "5h", remaining_fraction: fractions[1], reset_time: "2026-09-05T22:58Z" },
            ],
          },
          {
            name: "Claude and GPT models",
            description: "Third-party models",
            buckets: [
              { id: "claude-weekly", name: "Weekly", window: "7d", remaining_fraction: fractions[2], reset_time: "2026-09-12T22:45Z" },
            ],
          },
        ],
      },
    },
  });

  test("formatUsageReport renders a percentage and reset time per bucket", () => {
    const { ok, report } = formatUsageReport(usageJson([0.73, 0.934, 1]));
    assert.equal(ok, true);
    const lines = report.split("\n");
    assert.equal(lines.length, 3);
    assert.match(lines[0], /Gemini Models/);
    assert.match(lines[0], /Weekly/);
    assert.match(lines[0], /73% left/);
    assert.match(lines[0], /resets `2026-09-10T18:41Z`/);
    assert.match(lines[1], /93% left/); // 0.934 rounds down
    assert.match(lines[2], /Claude and GPT models/);
    assert.match(lines[2], /100% left/);
  });

  test("formatUsageReport is not ok when every bucket is exhausted", () => {
    // agy exits 0 while out of quota, so only the payload can reveal it.
    const { ok, report } = formatUsageReport(usageJson([0, 0, 0]));
    assert.equal(ok, false);
    assert.match(report, /exhausted/);
    // One bucket with quota left is still a usable account.
    assert.equal(formatUsageReport(usageJson([0.5, 0, 0])).ok, true);
  });

  test("formatUsageReport is not ok when the payload signals a non-SUCCESS status", () => {
    const { ok, report } = formatUsageReport(usageJson([1, 1, 1], "ERROR"));
    assert.equal(ok, false);
    assert.match(report, /ERROR/);
  });

  test("formatUsageReport degrades to a warning instead of throwing", () => {
    for (const raw of ["not json at all", "{}", JSON.stringify({ command: { data: { groups: [] } } })]) {
      const { ok, report } = formatUsageReport(raw);
      assert.equal(ok, false);
      assert.match(report, /⚠️/);
      assert.doesNotMatch(report, /left/);
      // Nothing here proves the account is usable, so it must not claim so.
      assert.doesNotMatch(report, /Signed in/i);
    }
  });

  const facts = (over: Partial<Parameters<typeof formatDoctorReport>[0]> = {}) => ({
    backend: { name: "agy", supportsModelSelection: true },
    backendSource: "auto-default",
    agy: { found: true, path: "C:/agy.exe", version: "1.1.27" },
    gemini: { found: false, path: "", version: "" },
    usage: formatUsageReport(usageJson([0.73, 0.934, 1])),
    ...over,
  });

  test("formatDoctorReport declares System Ready only when the account check is healthy", () => {
    assert.match(formatDoctorReport(facts()), /System Ready/);
    for (const usage of [
      formatUsageReport(usageJson([0, 0, 0])),          // out of quota
      formatUsageReport("update available\n{}"),        // unparseable exit-0 stdout
      { ok: false, report: "- ❌ Login check failed" },  // signed out / offline
    ]) {
      const report = formatDoctorReport(facts({ usage }));
      assert.doesNotMatch(report, /System Ready/);
      assert.match(report, /Action needed/);
    }
  });

  test("formatDoctorReport does not blame agy when the gemini backend is active", () => {
    // GEMINI_CLI_BACKEND=gemini: a signed-out agy on PATH says nothing about the
    // backend actually serving calls.
    const report = formatDoctorReport(facts({
      backend: { name: "gemini" },
      gemini: { found: true, path: "C:/gemini.cmd", version: "0.9.0" },
      usage: { ok: false, report: "- ℹ️ Skipped" },
    }));
    assert.match(report, /System Ready/);
    assert.doesNotMatch(report, /sign in/i);
  });

  test("formatDoctorReport tells a user with no agy to install it", () => {
    const report = formatDoctorReport(facts({
      agy: { found: false, path: "", version: "" },
      usage: { ok: false, report: "- ⚠️ Skipped" },
    }));
    assert.doesNotMatch(report, /System Ready/);
    assert.match(report, /Install Antigravity CLI/);
  });
});

describe("Tools: gemini-image", () => {
  test("gemini-image is registered in toolRegistry", () => {
    assert.equal(toolExists("gemini-image"), true);
    const defs = getToolDefinitions();
    const imageTool = defs.find((d) => d.name === "gemini-image");
    assert.ok(imageTool);
    const props = imageTool.inputSchema.properties as Record<string, unknown>;
    assert.ok(props.prompt);
    assert.ok(props.aspectRatio);
    assert.ok(props.outputPath);
    assert.ok((imageTool.inputSchema.required as string[]).includes("prompt"));
  });

  test("gemini-image throws error when prompt is missing", async () => {
    await assert.rejects(
      executeTool("gemini-image", {} as any),
      /prompt/i
    );
  });

  test("gemini-image exposes every aspect ratio agy names, plus size", () => {
    const defs = getToolDefinitions();
    const imageTool = defs.find((d) => d.name === "gemini-image");
    const props = imageTool!.inputSchema.properties as Record<string, any>;
    assert.deepEqual(props.aspectRatio.enum, [
      "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3",
      "5:4", "4:5", "21:9", "4:1", "1:4", "8:1", "1:8",
    ]);
    assert.deepEqual(props.size.enum, ["512", "1K", "2K", "4K"]);
    assert.ok(!(imageTool!.inputSchema.required as string[]).includes("size"));
    // --model selects the planner model and rejects image model ids, so the tool
    // must not offer one (audit improvement 6).
    assert.equal(props.model, undefined);
  });
});

describe("Tools: ping", () => {
  test("ping echoes the message verbatim, without cmd.exe quoting", async () => {
    // Regression for audit bug 10: the old spawn of the cmd.exe `echo` builtin
    // returned the message wrapped in commandExecutor's safety quotes.
    assert.equal(await executeTool("ping", { prompt: 'hello & world' }), "hello & world");
  });

  test("ping falls back to Pong! for an empty prompt", async () => {
    assert.equal(await executeTool("ping", {}), "Pong!");
  });
});

describe("Tools: ask-gemini enhancements", () => {
  test("ask-gemini schema exposes effort, mode, jsonSchema, addDirs, and includeUsage", () => {
    const defs = getToolDefinitions();
    const ask = defs.find((d) => d.name === "ask-gemini");
    assert.ok(ask);
    const props = ask.inputSchema.properties as Record<string, unknown>;
    assert.ok(props.effort);
    assert.ok(props.mode);
    assert.ok(props.jsonSchema);
    assert.ok(props.addDirs);
    assert.ok(props.includeUsage);
  });
});
