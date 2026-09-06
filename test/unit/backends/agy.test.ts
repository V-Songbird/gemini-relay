import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildAgyArgs, buildAgyPrompt, agyPrintTimeoutArg, isSlashCommand } from "../../../src/backends/agy.js";
import { extractReplies, conversationFreshSince } from "../../../src/backends/agyTranscript.js";
import { NO_AGY_CAPABILITIES } from "../../../src/backends/agyCapabilities.js";
import { COMMAND_TIMEOUT_MS } from "../../../src/utils/commandExecutor.js";
import { APPROVAL_MODES } from "../../../src/constants.js";

// Every capability advertised — what parseAgyHelp returns for a current agy.
const ALL_CAPS = Object.fromEntries(
  Object.entries(NO_AGY_CAPABILITIES).map(([k, v]) => [k, typeof v === "boolean" ? true : v]),
) as typeof NO_AGY_CAPABILITIES;

describe("Backends: agy arg building", () => {
  // --disable-slash-commands is on by default, so the per-flag cases below opt
  // out of it to assert only the flag each one is about.
  const args = (opts: Parameters<typeof buildAgyArgs>[0]) =>
    buildAgyArgs({ allowSlashCommands: true, ...opts }, ALL_CAPS);

  test("forwards model flags and normalizes aliases", () => {
    assert.deepEqual(args({ model: "gemini-3.8-flash-high" }), ["--model", "gemini-3.8-flash-high"]);
    assert.deepEqual(args({ model: "pro" }), ["--model", "gemini-3.1-pro-high"]);
    assert.deepEqual(args({ model: "flash" }), ["--model", "gemini-3.8-flash-high"]);
  });

  test("forwards reasoning effort, execution mode, and json schema", () => {
    assert.deepEqual(args({ effort: "high" }), ["--effort", "high"]);
    assert.deepEqual(args({ mode: "plan" }), ["--mode", "plan"]);
    assert.deepEqual(args({ jsonSchema: '{"type":"object"}' }), [
      "--json-schema",
      '{"type":"object"}',
    ]);
    assert.deepEqual(args({ addDirs: ["src", "test"] }), [
      "--add-dir",
      "src",
      "--add-dir",
      "test",
    ]);
  });

  test("uses --conversation for an explicit conversationId", () => {
    assert.deepEqual(args({ conversationId: "abc123" }), ["--conversation", "abc123"]);
  });

  test("disables slash expansion when the installed agy has the flag", () => {
    const caps = { ...NO_AGY_CAPABILITIES, disableSlashCommands: true };
    assert.deepEqual(buildAgyArgs({}, caps), ["--disable-slash-commands"]);
    // Opt-out: a caller who wants the free "/usage"-style commands keeps them.
    assert.deepEqual(buildAgyArgs({ allowSlashCommands: true }, caps), []);
    assert.deepEqual(buildAgyArgs({}, NO_AGY_CAPABILITIES), []);
  });

  test("forwards --agent only to a build that advertises it", () => {
    assert.deepEqual(buildAgyArgs({ agent: "reviewer" }, { ...NO_AGY_CAPABILITIES, agentFlag: true }), [
      "--agent",
      "reviewer",
    ]);
    assert.deepEqual(buildAgyArgs({ agent: "reviewer" }, NO_AGY_CAPABILITIES), []);
  });

  test("forwards --sandbox and maps only yolo to --dangerously-skip-permissions", () => {
    assert.deepEqual(args({ sandbox: true }), ["--sandbox"]);
    assert.deepEqual(args({ approvalMode: APPROVAL_MODES.YOLO }), ["--dangerously-skip-permissions"]);
    assert.deepEqual(args({ approvalMode: APPROVAL_MODES.PLAN }), []);
    assert.deepEqual(buildAgyArgs({ approvalMode: APPROVAL_MODES.YOLO }, NO_AGY_CAPABILITIES), []);
  });

  test("a slash prompt the caller opted into is routed off stdin", () => {
    // agy answers a command in the CLI itself and refuses to under stream-json,
    // so stdin delivery has to step aside or `allowSlashCommands` does nothing.
    assert.equal(isSlashCommand("/usage", { allowSlashCommands: true }), true);
    assert.equal(isSlashCommand("  /skills extra", { allowSlashCommands: true }), true);
    // Not opted in: the prompt goes to the model, on stdin, as ordinary text.
    assert.equal(isSlashCommand("/usage", {}), false);
    // Opted in but not a command: no reason to leave stdin.
    assert.equal(isSlashCommand("explain /usr/bin", { allowSlashCommands: true }), false);
  });

  test("a build that advertises nothing gets no flags at all", () => {
    // The help probe returns NO_AGY_CAPABILITIES when `agy --help` is missing,
    // slow or unrecognisable. Every option degrades to agy's own defaults rather
    // than risking an unknown flag, which would fail the whole run.
    const everything = {
      model: "pro",
      effort: "high" as const,
      mode: "plan" as const,
      jsonSchema: "{}",
      addDirs: ["src"],
      agent: "reviewer",
      conversationId: "abc123",
      sandbox: true,
      approvalMode: APPROVAL_MODES.YOLO,
    };
    assert.deepEqual(buildAgyArgs(everything, NO_AGY_CAPABILITIES), []);
    assert.equal(buildAgyArgs(everything, ALL_CAPS).length > 0, true);
  });
});

describe("Backends: agy prompt building", () => {
  test("inlines in-project @file references itself (agy does not)", () => {
    const out = buildAgyPrompt("summarise @package.json", {});
    assert.match(out, /BEGIN FILE: package\.json/);
    assert.match(out, /"name": "gemini-relay"/);
    assert.doesNotMatch(out, /@package\.json/); // token replaced by contents
  });

  test("keeps the project-root guard when inlining", () => {
    assert.throws(() => buildAgyPrompt("read @../secret", {}), /outside the project directory/);
  });

  test("wraps changeMode requests in the OLD/NEW template", () => {
    const out = buildAgyPrompt("rename foo", { changeMode: true });
    assert.match(out, /\[CHANGEMODE INSTRUCTIONS\]/);
    assert.match(out, /USER REQUEST:/);
  });

  test("does not inline an email address as an @file reference", () => {
    const out = buildAgyPrompt("email me at user@example.com about it", {});
    assert.match(out, /user@example\.com/);
    assert.doesNotMatch(out, /FILE NOT FOUND/);
  });
});

describe("Backends: agy transcript extraction", () => {
  test("returns DONE planner replies after the last user input", () => {
    const entries = [
      { type: "USER_INPUT", content: "old turn" },
      { source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", content: "stale" },
      { type: "USER_INPUT", content: "current turn" },
      { source: "MODEL", type: "PLANNER_RESPONSE", status: "IN_PROGRESS", content: "partial" },
      { source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", content: "the answer" },
    ];
    assert.equal(extractReplies(entries), "the answer");
  });

  test("ignores non-model and non-done entries", () => {
    const entries = [
      { type: "USER_INPUT", content: "q" },
      { source: "TOOL", type: "PLANNER_RESPONSE", status: "DONE", content: "tool noise" },
      { source: "MODEL", type: "OTHER", status: "DONE", content: "wrong type" },
    ];
    assert.equal(extractReplies(entries), "");
  });

  test("conversationFreshSince is false for an unknown conversation", () => {
    assert.equal(conversationFreshSince("nonexistent-conversation-id", 1), false);
  });
});

describe("Backends: agy print timeout", () => {
  test("derives from the command timeout cap, 60s under it", () => {
    const total = Math.floor(COMMAND_TIMEOUT_MS / 1000);
    const expected = total > 120 ? total - 60 : Math.max(1, Math.floor(total / 2));
    assert.equal(agyPrintTimeoutArg(), `${expected}s`);
    assert.equal(agyPrintTimeoutArg(45 * 60_000), "2640s"); // the 45m default
    assert.equal(agyPrintTimeoutArg(60_000), "30s"); // GEMINI_MCP_TIMEOUT=1
  });

  test("stays strictly under the wrapper SIGKILL at every setting", () => {
    // GEMINI_MCP_TIMEOUT=1 used to yield exactly 60s against a 60s kill, so the
    // wrapper killed agy before agy could report its own timeout.
    for (const wrapperMs of [6_000, 60_000, 120_000, 121_000, 45 * 60_000]) {
      const seconds = Number(agyPrintTimeoutArg(wrapperMs).replace(/s$/, ""));
      assert.ok(seconds >= 1, `${wrapperMs}ms → ${seconds}s must stay positive`);
      assert.ok(
        seconds * 1000 < wrapperMs,
        `${wrapperMs}ms → ${seconds}s must be strictly under the wrapper kill`,
      );
    }
  });

  test("AGY_PRINT_TIMEOUT overrides the derived value", () => {
    const prev = process.env.AGY_PRINT_TIMEOUT;
    process.env.AGY_PRINT_TIMEOUT = "30m";
    try {
      assert.equal(agyPrintTimeoutArg(), "30m");
    } finally {
      if (prev === undefined) delete process.env.AGY_PRINT_TIMEOUT;
      else process.env.AGY_PRINT_TIMEOUT = prev;
    }
  });
});
