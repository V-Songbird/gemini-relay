import { test, describe } from "node:test";
import assert from "node:assert/strict";
// Importing the tools index registers every tool in the shared registry.
import {
  getToolDefinitions,
  getPromptDefinitions,
  getPromptMessage,
  toolExists,
} from "../../../src/tools/index.js";

describe("MCP Registry: Tools & Prompts Schema", () => {
  test("every registered tool exposes a valid JSON-schema definition", () => {
    const defs = getToolDefinitions();
    assert.ok(defs.length >= 5); // gemini-ask, gemini-ping, gemini-help, gemini-brainstorm, gemini-fetch-chunk
    for (const def of defs) {
      assert.equal(typeof def.name, "string");
      assert.equal(typeof def.description, "string");
      assert.equal(def.inputSchema.type, "object");
      assert.equal(typeof def.inputSchema.properties, "object");
      assert.ok(Array.isArray(def.inputSchema.required));
    }
  });

  test("gemini-ask requires a prompt; ping's prompt is optional", () => {
    const defs = getToolDefinitions();
    const ask = defs.find((d) => d.name === "gemini-ask");
    const ping = defs.find((d) => d.name === "gemini-ping");
    assert.ok(ask && ping);
    assert.ok((ask!.inputSchema.properties as any).prompt);
    assert.ok((ask!.inputSchema.required as string[]).includes("prompt"));
    assert.ok(!(ping!.inputSchema.required as string[]).includes("prompt"));
  });

  test("toolExists reflects the registry", () => {
    assert.equal(toolExists("gemini-ask"), true);
    assert.equal(toolExists("gemini-fetch-chunk"), true);
    assert.equal(toolExists("does-not-exist"), false);
  });

  test("getPromptDefinitions lists tools that declare a prompt", () => {
    const prompts = getPromptDefinitions();
    const names = prompts.map((p) => p.name);
    assert.ok(names.includes("gemini-ask"));
    assert.ok(names.includes("gemini-brainstorm"));
    const ask = prompts.find((p) => p.name === "gemini-ask");
    assert.equal(typeof ask!.description, "string");
  });

  test("getPromptMessage formats prompt text, boolean flags, and key/value params", () => {
    const msg = getPromptMessage("gemini-ask", {
      prompt: "explain this",
      model: "gemini-2.5-flash",
      sandbox: true,
      changeMode: false, // false values are omitted
    });
    assert.match(msg, /^Use the gemini-ask tool: explain this/);
    assert.ok(msg.includes("(model: gemini-2.5-flash)"));
    assert.ok(msg.includes("[sandbox]")); // boolean true rendered as a flag
    assert.ok(!msg.includes("changeMode")); // false omitted
  });

  test("getPromptMessage handles a bare tool reference with no params", () => {
    assert.equal(getPromptMessage("gemini-help", {}), "Use the gemini-help tool");
  });
});

