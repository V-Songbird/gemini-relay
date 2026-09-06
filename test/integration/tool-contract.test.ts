import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
// Drives the registry -> tool boundary for every path that resolves WITHOUT
// invoking the Gemini CLI: argument validation, and the guard/error branches
// inside the tools. (The happy path that actually calls Gemini is covered by
// the e2e suite.) These must never spawn a subprocess.
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { executeTool } from "../../src/tools/index.js";
import { server, startProgressUpdates, stopProgressUpdates } from "../../src/index.js";
import { PROTOCOL } from "../../src/constants.js";
import { clearCache } from "../../src/utils/chunkCache.js";

beforeEach(() => clearCache());

describe("MCP Subsystem Integration: Tool Input Validation Contracts", () => {
  test("executeTool surfaces zod validation as a friendly error", async () => {
    // ask-gemini requires a non-empty prompt; the error names the offending field.
    await assert.rejects(() => executeTool("ask-gemini", {}), /Invalid arguments for ask-gemini.*prompt/s);
  });

  test("executeTool throws for an unknown tool", async () => {
    await assert.rejects(() => executeTool("no-such-tool", {}), /Unknown tool/);
  });

  test("fetch-chunk via the registry returns a cache-miss message (no spawn)", async () => {
    const out = await executeTool("fetch-chunk", { cacheKey: "deadbeef", chunkIndex: 1 });
    assert.match(out, /Cache miss/);
  });

  test("fetch-chunk via the registry rejects a malformed cache key (no spawn)", async () => {
    const out = await executeTool("fetch-chunk", { cacheKey: "not-a-key", chunkIndex: 1 });
    assert.match(out, /Invalid cacheKey format/);
  });

  test("ask-gemini rejects a malformed chunkCacheKey before calling Gemini", async () => {
    const out = await executeTool("ask-gemini", {
      prompt: "x",
      changeMode: true,
      chunkIndex: 1,
      chunkCacheKey: "bad!key!",
    });
    assert.match(out, /Invalid chunkCacheKey format/);
  });

  test("ask-gemini changeMode continuation with a missing cache reports a cache miss (no spawn)", async () => {
    // Well-formed key, but nothing cached -> the continuation path returns the
    // cache-miss message rather than shelling out to Gemini.
    const out = await executeTool("ask-gemini", {
      prompt: "x",
      changeMode: true,
      chunkIndex: 1,
      chunkCacheKey: "deadbeef",
    });
    assert.match(out, /Cache miss/);
  });
});

// Field-audit bug 5: the keepalive state used to live at module scope, so the
// first tool call to finish flipped the flag for every other in-flight call —
// their intervals cleared themselves, their final notification carried the
// wrong operation name, and their output previews crossed over. agy runs are
// serialized behind a promise queue, so the silenced call is exactly the one
// queued for minutes. These drive overlapping calls through the real server
// notification path over an in-memory transport: no stdio, no CLI, no network.
describe("MCP Subsystem Integration: Concurrent Progress Keepalives", () => {
  const notifications: any[] = [];
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const progressFor = (token: string) =>
    notifications
      .filter((n) => n.method === PROTOCOL.NOTIFICATIONS.PROGRESS && n.params?.progressToken === token)
      .map((n) => n.params);

  // Fires the keepalive intervals by hand. node:test's `mock.timers` is not an
  // option here: MockTimers landed in Node 20.4 and its `enable({ apis })` form
  // in 20.11, while package.json declares a 18.19 floor and CI runs 18.x — the
  // tests would throw on the gating leg. Swapping the global setInterval the
  // module calls behaves identically on every supported runtime, and lets us
  // assert the 25s cadence outright instead of inferring it from a tick.
  type Tick = (times?: number) => Promise<void>;
  const g = globalThis as { setInterval: typeof setInterval; clearInterval: typeof clearInterval };

  async function withCapturedIntervals(body: (tick: Tick) => Promise<void>) {
    const realSetInterval = g.setInterval;
    const realClearInterval = g.clearInterval;
    const live = new Map<object, { fire: () => unknown; ms: number }>();

    g.setInterval = ((fire: () => unknown, ms: number) => {
      const handle = {};
      live.set(handle, { fire, ms });
      return handle as unknown as NodeJS.Timeout;
    }) as unknown as typeof setInterval;
    g.clearInterval = ((handle: object) => void live.delete(handle)) as typeof clearInterval;

    const tick: Tick = async (times = 1) => {
      for (let i = 0; i < times; i++) {
        for (const timer of [...live.values()]) {
          assert.equal(timer.ms, PROTOCOL.KEEPALIVE_INTERVAL, "keepalive stays on the 25s cadence");
          await timer.fire();
        }
      }
      await flush();
    };

    try {
      await body(tick);
    } finally {
      g.setInterval = realSetInterval;
      g.clearInterval = realClearInterval;
    }
  }

  before(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    clientTransport.onmessage = (message: any) => notifications.push(message);
    await clientTransport.start();
    await server.connect(serverTransport);
  });

  after(() => server.close());

  beforeEach(() => {
    notifications.length = 0;
  });

  test("two overlapping calls each complete under their own operation name", async () => {
    const a = startProgressUpdates("ask-gemini", "token-a");
    const b = startProgressUpdates("brainstorm", "token-b");
    await flush();

    stopProgressUpdates(a, true); // the shared-state version stole b's name here
    stopProgressUpdates(b, false);
    await flush();

    assert.deepEqual(progressFor("token-a").map((p) => p.message), [
      "🔍 Starting ask-gemini",
      "✅ ask-gemini completed successfully",
    ]);
    assert.deepEqual(progressFor("token-b").map((p) => p.message), [
      "🔍 Starting brainstorm",
      "❌ brainstorm failed",
    ]);

    // Wire shape: indeterminate at the start, 100/100 at the end.
    const [start, final] = progressFor("token-a");
    assert.deepEqual(start, { progressToken: "token-a", progress: 0, message: "🔍 Starting ask-gemini" });
    assert.equal(final.progress, 100);
    assert.equal(final.total, 100);
  });

  test("a finished call does not silence the keepalive of one still running", async () => {
    await withCapturedIntervals(async (tick) => {
      const a = startProgressUpdates("ask-gemini", "token-a");
      const b = startProgressUpdates("gemini-plan", "token-b");
      a.latestOutput = "OUTPUT-FROM-A";
      b.latestOutput = "OUTPUT-FROM-B";
      await flush();

      await tick();
      assert.equal(progressFor("token-a").length, 2, "start + one keepalive tick");
      assert.equal(progressFor("token-b").length, 2, "start + one keepalive tick");

      stopProgressUpdates(a, true);
      notifications.length = 0;
      await tick(2);

      assert.equal(progressFor("token-a").length, 0, "the finished call stays quiet");
      const stillRunning = progressFor("token-b").map((p) => p.message as string);
      assert.equal(stillRunning.length, 2, "the queued call keeps its own 25s keepalive");
      for (const message of stillRunning) {
        assert.match(message, /gemini-plan/);
        assert.match(message, /📝 Output: \.\.\.OUTPUT-FROM-B$/);
        assert.doesNotMatch(message, /OUTPUT-FROM-A/);
      }

      stopProgressUpdates(b, true);
    });
  });

  test("a call without a progressToken stays silent while a sibling reports", async () => {
    await withCapturedIntervals(async (tick) => {
      const quiet = startProgressUpdates("ping");
      const loud = startProgressUpdates("ask-gemini", "token-loud");
      await flush();

      await tick();

      stopProgressUpdates(quiet, true);
      stopProgressUpdates(loud, true);
      await flush();

      assert.equal(notifications.length, progressFor("token-loud").length);
      assert.equal(progressFor("token-loud").length, 3, "start + tick + completion");
    });
  });
});
