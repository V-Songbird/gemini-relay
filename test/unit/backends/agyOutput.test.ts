import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseAgyHelp, NO_AGY_CAPABILITIES } from "../../../src/backends/agyCapabilities.js";
import {
  agyConversationId,
  agyErrorText,
  agyResult,
  agyResultNotices,
  parseAgyJsonResponse,
  shSingleQuote,
  streamJsonUserMessage,
  stripScriptNoise,
  ptyEnabled,
} from "../../../src/backends/agyOutput.js";

describe("Backends: agy capability probing (Phase 3)", () => {
  test("detects flags advertised by `agy --help`", () => {
    const help = [
      "Usage: agy [options]",
      "  -p, --prompt <text>      run a one-shot prompt",
      "  --output-format <fmt>    output format: text, json",
      "  --conversation <id>      resume a specific conversation",
      "  -c, --continue           continue the most recent conversation",
      "  --print-timeout <ms>     bound a headless run",
    ].join("\n");
    const caps = parseAgyHelp(help);
    assert.equal(caps.outputFormatJson, true);
    assert.equal(caps.conversationId, true);
    assert.equal(caps.continueFlag, true);
    assert.equal(caps.printTimeout, true);
  });

  test("a 1.0.x help with no json mode yields the conservative defaults", () => {
    const caps = parseAgyHelp("Usage: agy\n  -p, --prompt <text>\n  -i  interactive login");
    assert.equal(caps.outputFormatJson, false);
    assert.equal(caps.printTimeout, false);
  });

  test("empty help is treated as no capabilities", () => {
    assert.deepEqual(parseAgyHelp(""), NO_AGY_CAPABILITIES);
  });

  test("detects --disable-slash-commands and --agent (agy 1.1.27)", () => {
    const help = [
      "  --agent                         Run a custom agent by name (agent.md)",
      "  --disable-slash-commands        Disable slash command and skill expansion in print mode",
    ].join("\n");
    const caps = parseAgyHelp(help);
    assert.equal(caps.disableSlashCommands, true);
    assert.equal(caps.agentFlag, true);
    const old = parseAgyHelp("Usage: agy\n  -p, --prompt <text>");
    assert.equal(old.disableSlashCommands, false);
    assert.equal(old.agentFlag, false);
  });

  test("detects stream-json prompt delivery on stdin (agy 1.1.15+)", () => {
    const help = [
      "  --input-format                  Input format for print mode (text, stream-json). stream-json reads one NDJSON message per line from stdin",
      "  --output-format                 Output format for print mode (text, json, stream-json) (default text)",
    ].join("\n");
    assert.equal(parseAgyHelp(help).streamJsonInput, true);
    assert.equal(parseAgyHelp("  --output-format <fmt>  text, json").streamJsonInput, false);
  });
});

describe("Backends: agy stream-json prompt delivery", () => {
  test("streamJsonUserMessage is the one line agy accepts on stdin", () => {
    const line = streamJsonUserMessage("hi\nthere");
    assert.ok(line.endsWith("\n"));
    assert.deepEqual(JSON.parse(line), { event: "user", message: { role: "user", content: "hi\nthere" } });
  });

  test("agyResult picks the final result event out of the event stream", () => {
    const out = [
      '{"event":"init","init":{"model":"gemini-3.8-flash-low"}}',
      '{"event":"step_update","step_update":{"text_delta":"po"}}',
      '{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"pong"}}',
    ].join("\n");
    const r = agyResult(out, true);
    assert.equal(r?.response, "pong");
    assert.equal(agyErrorText(r), undefined);
    assert.equal(parseAgyJsonResponse(JSON.stringify(r)), "pong");
  });

  test("a stale structured_output from an earlier turn does not replace the new reply", () => {
    // Resuming a conversation that once used --json-schema: agy reports both.
    const result = JSON.stringify({ response: "package-lock.json", structured_output: { count: 392 } });
    assert.equal(parseAgyJsonResponse(result), "package-lock.json");
    assert.match(parseAgyJsonResponse(result, { preferStructured: true }) ?? "", /"count": 392/);
    assert.match(parseAgyJsonResponse(JSON.stringify({ response: "", structured_output: { count: 1 } })) ?? "", /"count": 1/);
  });

  test("agyConversationId surfaces the id that resumes this thread", () => {
    assert.equal(agyConversationId({ conversation_id: " c1 " }), "c1");
    assert.equal(agyConversationId({ conversation_id: "" }), undefined);
    assert.equal(agyConversationId(undefined), undefined);
  });

  test("agyResultNotices reports a refused tool action and a non-SUCCESS status", () => {
    // Observed live on a headless run with nobody around to approve the question.
    const notices = agyResultNotices({
      status: "SUCCESS",
      denied_actions: [{ display_name: "AskQuestion" }, {}],
    });
    assert.equal(notices.length, 1);
    assert.match(notices[0], /refused 2 tool action\(s\).*AskQuestion, unnamed action/);
    assert.match(agyResultNotices({ status: "TIMEOUT" })[0], /status "TIMEOUT"/);
    assert.deepEqual(agyResultNotices({ status: "SUCCESS", denied_actions: [] }), []);
    assert.deepEqual(agyResultNotices(undefined), []);
  });

  test("agyErrorText surfaces agy's own verdict in json and stream modes", () => {
    const err = '{"conversation_id":"","status":"ERROR","response":"","error":"invalid model selection"}';
    assert.equal(agyErrorText(agyResult(err, false)), "invalid model selection");
    assert.equal(agyErrorText(agyResult(`{"event":"result","result":${err}}`, true)), "invalid model selection");
    assert.equal(agyResult("not json", false), undefined);
    assert.equal(agyResult("", true), undefined);
  });
});

describe("Backends: agy JSON stdout parsing (Phase 3)", () => {
  test("reads a single result object's conventional reply field", () => {
    assert.equal(parseAgyJsonResponse('{"response":"hello world"}'), "hello world");
    assert.equal(parseAgyJsonResponse('{"text":"  spaced  "}'), "spaced");
  });

  test("reads a JSONL/stream of transcript entries via the canonical extractor", () => {
    const stream = [
      '{"type":"USER_INPUT","content":"q"}',
      '{"source":"MODEL","type":"PLANNER_RESPONSE","status":"IN_PROGRESS","content":"part"}',
      '{"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"the answer"}',
    ].join("\n");
    assert.equal(parseAgyJsonResponse(stream), "the answer");
  });

  test("handles a top-level array of entries", () => {
    const arr = JSON.stringify([
      { type: "USER_INPUT", content: "q" },
      { source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", content: "arr answer" },
    ]);
    assert.equal(parseAgyJsonResponse(arr), "arr answer");
  });

  test("honours includeUsage on every prose reply shape, never in a schema body", () => {
    const usage = { usage: { input_tokens: 1000, output_tokens: 20 }, duration_seconds: 2 };
    const line = /📊 \[Tokens: 1,000 in, 20 out \| 2\.0s\]/;
    // plain reply
    assert.match(
      parseAgyJsonResponse(JSON.stringify({ response: "hi", ...usage }), { includeUsage: true }) ?? "",
      line,
    );
    // ...but never inside a --json-schema body: the caller JSON.parses that, and
    // a trailing token line would break it.
    const structured = JSON.stringify({ response: "hi", structured_output: { count: 9 }, ...usage });
    assert.equal(
      parseAgyJsonResponse(structured, { includeUsage: true, preferStructured: true }),
      '{\n  "count": 9\n}',
    );
    // transcript-shaped stream: used to return before usage was collected
    const stream = [
      JSON.stringify({ type: "USER_INPUT", content: "q" }),
      JSON.stringify({ source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", content: "the answer" }),
      JSON.stringify(usage),
    ].join("\n");
    assert.match(parseAgyJsonResponse(stream, { includeUsage: true }) ?? "", line);
    // and no token line at all when the caller did not ask for one
    assert.doesNotMatch(parseAgyJsonResponse(stream) ?? "", line);
  });

  test("returns undefined for empty or non-JSON stdout", () => {
    assert.equal(parseAgyJsonResponse(""), undefined);
    assert.equal(parseAgyJsonResponse("not json at all"), undefined);
  });
});

describe("Backends: PTY helpers (Phase 3, S1b)", () => {
  test("shSingleQuote makes injection metacharacters inert", () => {
    assert.equal(shSingleQuote("plain"), "'plain'");
    // an embedded single quote is closed, escaped, and reopened
    assert.equal(shSingleQuote("a'b"), "'a'\\''b'");
    // metacharacters survive literally inside the quotes
    assert.equal(shSingleQuote("a; rm -rf /"), "'a; rm -rf /'");
  });

  test("stripScriptNoise drops the script(1) banners and CRs", () => {
    const raw = "Script started, file is /dev/null\r\nthe answer\r\nScript done, file is /dev/null\r\n";
    assert.equal(stripScriptNoise(raw), "the answer");
  });

  test("ptyEnabled is opt-in via AGY_MCP_PTY", () => {
    assert.equal(ptyEnabled({}), false);
    assert.equal(ptyEnabled({ AGY_MCP_PTY: "1" }), true);
    assert.equal(ptyEnabled({ AGY_MCP_PTY: "true" }), true);
    assert.equal(ptyEnabled({ AGY_MCP_PTY: "0" }), false);
  });
});
