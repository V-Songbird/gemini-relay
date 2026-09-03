import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getToolDefinitions,
  toolExists,
  executeTool,
} from "../../../src/tools/index.js";
import { MODELS } from "../../../src/constants.js";

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

  test("gemini-doctor execute reports diagnostic health", async () => {
    const result = await executeTool("gemini-doctor", {});
    assert.ok(typeof result === "string");
    assert.match(result, /Gemini MCP Tool Doctor/);
    assert.match(result, /Runtime Environment/);
    assert.match(result, /Antigravity CLI/);
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
