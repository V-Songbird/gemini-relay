import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  quoteForCmd,
  resolveCommandForExecution,
  buildEnoentErrorMessage,
  selectWindowsGeminiCandidate,
  executeCommand,
} from "../../../src/utils/commandExecutor.js";
import { Logger } from "../../../src/utils/logger.js";

describe("Node Utilities: Command Executor & Quoting", () => {
  test("quoteForCmd wraps in double quotes and doubles embedded quotes", () => {
    assert.equal(quoteForCmd("hello"), '"hello"');
    assert.equal(quoteForCmd("a&calc"), '"a&calc"'); // cmd metachar made inert by quoting
    assert.equal(quoteForCmd('a"b'), '"a""b"');
  });

  test("quoteForCmd doubles a trailing backslash so it can't escape the closing quote", () => {
    assert.equal(quoteForCmd("path\\"), '"path\\\\"');
  });

  test("resolveCommandForExecution is a no-op off Windows", () => {
    if (process.platform !== "win32") {
      assert.equal(resolveCommandForExecution("gemini"), "gemini");
      assert.equal(resolveCommandForExecution("echo"), "echo");
    } else {
      // On Windows it should at least never return an empty string.
      assert.ok(resolveCommandForExecution("gemini").length > 0);
    }
  });

  test("selectWindowsGeminiCandidate ignores unsupported PowerShell and extensionless shims", () => {
    assert.equal(
      selectWindowsGeminiCandidate([
        "C:\\Users\\Songbird\\AppData\\Roaming\\npm\\gemini",
        "C:\\Users\\Songbird\\AppData\\Roaming\\npm\\gemini.ps1",
      ]),
      "gemini.cmd",
    );
    assert.equal(
      selectWindowsGeminiCandidate([
        "C:\\Users\\Songbird\\AppData\\Roaming\\npm\\gemini",
        "C:\\Users\\Songbird\\AppData\\Roaming\\npm\\gemini.cmd",
        "C:\\Users\\Songbird\\AppData\\Roaming\\npm\\gemini.ps1",
      ]),
      "C:\\Users\\Songbird\\AppData\\Roaming\\npm\\gemini.cmd",
    );
  });

  test("buildEnoentErrorMessage gives gemini retirement + migration guidance", () => {
    const msg = buildEnoentErrorMessage("gemini");
    assert.match(msg, /Could not find the "gemini"/);
    assert.match(msg, /2026-06-18/); // retirement date
    assert.match(msg, /Antigravity|agy/i); // points at the successor
    assert.match(msg, /GEMINI_CLI_PATH/); // override still offered for unaffected tiers
    assert.doesNotMatch(msg, /npm install -g @google\/gemini-cli/); // dead advice removed
    assert.match(msg, process.platform === "win32" ? /where gemini/ : /which gemini/);
  });

  test("buildEnoentErrorMessage points agy users to install + the gemini fallback env", () => {
    const msg = buildEnoentErrorMessage("agy");
    assert.match(msg, /Could not find the "agy"/);
    assert.match(msg, /AGY_CLI_PATH/);
    assert.match(msg, /GEMINI_MCP_BACKEND/); // how enterprise stays on gemini
    assert.doesNotMatch(msg, /@google\/gemini-cli/);
  });

  test("buildEnoentErrorMessage names the real Windows install path", () => {
    // Stub the platform rather than guarding on it: CI is ubuntu-latest, so a
    // `if (process.platform === "win32")` guard leaves this branch — the only
    // pin on the corrected install location — unverified everywhere it runs.
    const real = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      const msg = buildEnoentErrorMessage("agy");
      // The real location on a current build; the legacy Antigravity\ directory
      // may still be mentioned, but never on its own.
      assert.match(msg, /%LOCALAPPDATA%\\agy\\bin\\agy\.exe/);
      assert.match(msg, /where agy/);
    } finally {
      Object.defineProperty(process, "platform", real);
    }
  });

  test("Logger.commandExecution logs argv shape, never an argument body", () => {
    // Prompts now carry whole inlined files; echoing them would dump megabytes
    // to the MCP server's stderr and into client logs on every spawn.
    const prompt = "SECRET_PROMPT_BODY ".repeat(50);
    const lines: string[] = [];
    const realWarn = console.warn;
    const realEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV; // Logger mutes non-error output under NODE_ENV=test
    console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    try {
      Logger.commandExecution("agy", ["-p", prompt, "--output-format=json", "sonnet"], 1234);
    } finally {
      console.warn = realWarn;
      if (realEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = realEnv;
    }
    const out = lines.join("\n");
    assert.doesNotMatch(out, /SECRET_PROMPT_BODY/);
    assert.match(out, / -p /); // flags stay legible
    assert.match(out, /--output-format=json/);
    assert.match(out, new RegExp(`<${prompt.length} chars>`)); // body becomes a length
    assert.match(out, /<6 chars>/); // so does a non-flag value
    // Nor may the Logger retain the argv: the old start-time map was write-only,
    // and the timeout / spawn-error paths never call commandComplete, so each
    // failed run pinned a whole inlined prompt for the life of the MCP server.
    const retained = Object.getOwnPropertyNames(Logger).map((k) => {
      const v = (Logger as unknown as Record<string, unknown>)[k];
      return v instanceof Map ? JSON.stringify([...v]) : String(v);
    });
    assert.ok(!retained.some((v) => v.includes("SECRET_PROMPT_BODY")));
  });

  test("executeCommand kills and rejects a child that outlives the timeout", async () => {
    // A child that would run for 30s, bounded to 200ms. Without the timeout a
    // hung CLI would leave this promise (and the agy queue) pending forever.
    await assert.rejects(
      executeCommand(
        process.execPath,
        ["-e", "setTimeout(() => {}, 30000)"],
        undefined,
        undefined,
        200,
      ),
      /timed out after/,
    );
  });

  test("executeCommand resolves trimmed stdout well within the default timeout", async () => {
    const out = await executeCommand(process.execPath, ["-e", "console.log('  ok  ')"]);
    assert.equal(out, "ok");
  });

  test("executeCommand surfaces stderr when a clean exit produced no stdout", async () => {
    // agy hits its quota: exit 0, empty stdout, the reason on stderr. The real
    // message must reach the caller, not a silent "".
    await assert.rejects(
      executeCommand(process.execPath, [
        "-e",
        "process.stderr.write('Individual quota reached'); process.exit(0)",
      ]),
      /Individual quota reached/,
    );
  });

  test("executeCommand keeps stdout on a non-zero exit so a CLI's JSON verdict survives", async () => {
    // agy exits 1 with its error as JSON on stdout and nothing on stderr.
    await assert.rejects(
      executeCommand(process.execPath, [
        "-e",
        "console.log('{\"error\":\"bad model\"}'); process.exit(1)",
      ]),
      (e: Error & { stdout?: string; exitCode?: number | null }) =>
        /bad model/.test(e.message) && e.stdout?.includes('"error"') === true && e.exitCode === 1,
    );
  });

  test("executeCommand resolves stdout even when the child also writes to stderr", async () => {
    const out = await executeCommand(process.execPath, [
      "-e",
      "process.stderr.write('a warning'); console.log('answer')",
    ]);
    assert.equal(out, "answer");
  });
});
