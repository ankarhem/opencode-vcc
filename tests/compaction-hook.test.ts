import { describe, it, expect } from "bun:test";
import {
  createCompactionHooks,
  extractPreviousSummary,
  type CompactionHookDeps,
} from "../src/hooks/compaction";
import {
  formatCompactionStats,
  type CompactionStats,
} from "../src/core/report";
import type { HistoryEntry } from "../src/core/render-entries";
import { DEFAULT_SETTINGS, type VccSettings } from "../src/core/settings";
import { RECALL_NOTE } from "../src/core/format";

const userEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "user" },
  parts: [{ type: "text", text }],
});

const assistantEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "assistant" },
  parts: [{ type: "text", text }],
});

/**
 * A compaction summary assistant message (info.summary === true). Passing an
 * empty text models the freshly-created target message that exists BEFORE the
 * summary stream runs.
 */
const summaryEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "assistant", summary: true, agent: "compaction" },
  parts: text ? [{ type: "text", text }] : [],
});

const convo = (): HistoryEntry[] => [
  userEntry("u1", "Fix the login bug"),
  assistantEntry("a1", "Digging into the auth flow."),
  summaryEntry("sum_new", ""),
];

interface Harness {
  deps: CompactionHookDeps;
  toasts: Array<{ body: { message: string; variant: string } }>;
  prompts: string[];
  debugData: unknown[];
  getMessagesCalls: () => number;
}

function makeHarness(opts: {
  messages: HistoryEntry[];
  settings?: Partial<VccSettings>;
  now?: () => number;
}): Harness {
  const toasts: Array<{ body: { message: string; variant: string } }> = [];
  const prompts: string[] = [];
  const debugData: unknown[] = [];
  const counters = { messages: 0 };

  const deps: CompactionHookDeps = {
    client: {
      session: {
        messages: async () => {
          counters.messages += 1;
          return opts.messages;
        },
        prompt: async (_sessionID: string, content: string) => {
          prompts.push(content);
          return undefined;
        },
      },
      tui: {
        showToast: async (args) => {
          toasts.push(args);
          return undefined;
        },
      },
    },
    settings: { ...DEFAULT_SETTINGS, ...opts.settings },
    now: opts.now,
    debugWrite: (data) => {
      debugData.push(data);
    },
  };

  return {
    deps,
    toasts,
    prompts,
    debugData,
    getMessagesCalls: () => counters.messages,
  };
}

const emptyOutput = (): { context: string[]; prompt?: string } => ({
  context: [],
});

describe("extractPreviousSummary", () => {
  it("returns undefined when no summary message is present", () => {
    expect(
      extractPreviousSummary([
        userEntry("u1", "hi"),
        assistantEntry("a1", "yo"),
      ]),
    ).toBeUndefined();
  });

  it("returns the text of the last non-empty summary message", () => {
    const msgs = [
      summaryEntry("old", "[Session Goal]\n- OLD goal"),
      userEntry("u1", "later work"),
      summaryEntry("newer", "[Session Goal]\n- NEWER goal"),
    ];
    expect(extractPreviousSummary(msgs)).toBe("[Session Goal]\n- NEWER goal");
  });

  it("skips the empty freshly-created compaction target message", () => {
    const msgs = [
      summaryEntry("prev", "[Session Goal]\n- real previous"),
      userEntry("u1", "new turn"),
      summaryEntry("fresh", ""),
    ];
    expect(extractPreviousSummary(msgs)).toBe(
      "[Session Goal]\n- real previous",
    );
  });
});

describe("createCompactionHooks - session.compacting", () => {
  it("does not handle compaction with no pending and override off", async () => {
    const h = makeHarness({
      messages: convo(),
      settings: { overrideDefaultCompaction: false },
    });
    const hooks = createCompactionHooks(h.deps);
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);
    expect(output.prompt).toBeUndefined();
    expect(h.getMessagesCalls()).toBe(0);
  });

  it("handles compaction when a pending request is set (echo prompt)", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);
    expect(output.prompt).toBe("Reply with exactly: OK");
    expect(h.getMessagesCalls()).toBe(1);
  });

  it("handles compaction when overrideDefaultCompaction is on, without pending", async () => {
    const h = makeHarness({
      messages: convo(),
      settings: { overrideDefaultCompaction: true },
    });
    const hooks = createCompactionHooks(h.deps);
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);
    expect(output.prompt).toBe("Reply with exactly: OK");
  });

  it("returns without setting a prompt when the compiled summary is empty", async () => {
    const h = makeHarness({ messages: [] });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);
    expect(output.prompt).toBeUndefined();
  });

  it("feeds the extracted previous summary into the compiled result", async () => {
    const msgs = [
      summaryEntry("prev", "[Session Goal]\n- PRIORGOAL"),
      userEntry("u1", "New instruction here"),
      assistantEntry("a1", "Working on it."),
      summaryEntry("sum_new", ""),
    ];
    const h = makeHarness({ messages: msgs });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);

    const out = { text: "OK" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toContain("PRIORGOAL");
  });
});

describe("createCompactionHooks - text.complete HARD GATE", () => {
  it("overwrites the recorded summary message, fires toast + follow-up, clears state", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: 2, followUpPrompt: "do next" });
    const cOut = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, cOut);
    expect(cOut.prompt).toBe("Reply with exactly: OK");

    const out = { text: "OK" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p1" },
      out,
    );

    expect(out.text).not.toBe("OK");
    expect(out.text).toContain("[Session Goal]");

    const expectedStats: CompactionStats = {
      summarized: 3,
      previousSummaryUsed: false,
      keepN: 2,
      requestedKeepExplicit: true,
    };
    expect(h.toasts.length).toBe(1);
    expect(h.toasts[0]?.body.message).toBe(
      formatCompactionStats(expectedStats),
    );
    expect(h.toasts[0]?.body.variant).toBe("info");

    expect(h.prompts).toEqual(["do next"]);

    // state cleared → a second gated text.complete is a no-op
    const out2 = { text: "second" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p2" },
      out2,
    );
    expect(out2.text).toBe("second");
    expect(h.toasts.length).toBe(1);
    expect(h.prompts).toEqual(["do next"]);
  });

  it("SAFETY: never overwrites text for a non-summary messageID", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    const cOut = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, cOut);

    const out = { text: "a normal assistant reply" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "a1", partID: "p" },
      out,
    );

    expect(out.text).toBe("a normal assistant reply");
    expect(h.toasts.length).toBe(0);
    expect(h.prompts.length).toBe(0);
  });

  it("does nothing when there is no computed entry for the session", async () => {
    const h = makeHarness({ messages: [] });
    const hooks = createCompactionHooks(h.deps);
    const out = { text: "keep me" };
    await hooks["experimental.text.complete"](
      { sessionID: "sX", messageID: "m1", partID: "p" },
      out,
    );
    expect(out.text).toBe("keep me");
    expect(h.toasts.length).toBe(0);
    expect(h.prompts.length).toBe(0);
  });

  it("does not send a follow-up when none was requested", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    const cOut = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, cOut);

    const out = { text: "OK" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toContain("[Session Goal]");
    expect(h.prompts.length).toBe(0);
    expect(h.toasts.length).toBe(1);
  });
});

describe("createCompactionHooks - event cleanup", () => {
  const primeSession = async (h: Harness) => {
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );
    return hooks;
  };

  it("clears state on session.compacted", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = await primeSession(h);
    await hooks.event({
      event: { type: "session.compacted", properties: { sessionID: "s1" } },
    });
    const out = { text: "OK" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toBe("OK");
  });

  it("clears state on session.error", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = await primeSession(h);
    await hooks.event({
      event: { type: "session.error", properties: { sessionID: "s1" } },
    });
    const out = { text: "OK" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toBe("OK");
  });

  it("ignores unrelated event types (state survives)", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = await primeSession(h);
    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "s1" } },
    });
    const out = { text: "OK" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).not.toBe("OK");
    expect(out.text).toContain("[Session Goal]");
  });
});

describe("createCompactionHooks - TTL eviction", () => {
  it("evicts a pending entry older than the TTL on access", async () => {
    let t = 0;
    const h = makeHarness({ messages: convo(), now: () => t });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null }); // requestedAt = 0
    t = 61_000; // > 60s later
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);
    expect(output.prompt).toBeUndefined();
    expect(h.getMessagesCalls()).toBe(0);
  });

  it("keeps a pending entry that is still within the TTL", async () => {
    let t = 0;
    const h = makeHarness({ messages: convo(), now: () => t });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    t = 30_000;
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);
    expect(output.prompt).toBe("Reply with exactly: OK");
  });
});

describe("createCompactionHooks - augments default LLM compaction", () => {
  it("appends RECALL_NOTE to an LLM compaction summary we did not compute", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    const out = {
      text: "The user asked to fix the login bug; auth flow inspected.",
    };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toContain("The user asked to fix the login bug");
    expect(out.text).toContain(RECALL_NOTE);
    expect(out.text.endsWith(RECALL_NOTE)).toBe(true);
  });

  it("does NOT append to ordinary (non-summary) assistant text", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    const out = { text: "just a normal reply" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "a1", partID: "p" },
      out,
    );
    expect(out.text).toBe("just a normal reply");
  });

  it("does NOT double-append when we already computed our own summary", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );
    const out = { text: "OK" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toContain("[Session Goal]");
    // compile() line-wraps RECALL_NOTE; count a marker that survives wrapping.
    const occurrences = out.text.split("vcc_recall").length - 1;
    expect(occurrences).toBe(1);
  });

  it("does not append twice if text.complete fires again for the same summary", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);
    const out = { text: "LLM summary body." };
    const call = () =>
      hooks["experimental.text.complete"](
        { sessionID: "s1", messageID: "sum_new", partID: "p" },
        out,
      );
    await call();
    await call();
    const occurrences = out.text.split(RECALL_NOTE).length - 1;
    expect(occurrences).toBe(1);
  });

  it("appends RECALL_NOTE even when session.compacted fires before text.complete", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    await hooks.event({
      event: { type: "session.compacted", properties: { sessionID: "s1" } },
    });

    const out = { text: "LLM summary body." };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );

    expect(out.text).toContain(RECALL_NOTE);
  });

  it("uses nativeCompacting flag from compacting() and skips messages() lookup", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    const callsAfterCompacting = h.getMessagesCalls();

    const out = { text: "LLM summary body." };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );

    expect(out.text).toContain(RECALL_NOTE);
    expect(h.getMessagesCalls()).toBe(callsAfterCompacting);
  });

  it("prevents double-append with fresh output objects after nativeCompacting augment", async () => {
    const h = makeHarness({ messages: convo() });
    const hooks = createCompactionHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    const out1 = { text: "first summary." };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out1,
    );
    expect(out1.text).toContain(RECALL_NOTE);

    const out2 = { text: "second text." };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p2" },
      out2,
    );
    expect(out2.text).toBe("second text.");
  });

  it("writes a debug dump for the augment path when debug is enabled", async () => {
    const h = makeHarness({ messages: convo(), settings: { debug: true } });
    const hooks = createCompactionHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      { text: "LLM summary." },
    );

    const augmentDump = h.debugData.find(
      (d) =>
        typeof d === "object" &&
        d !== null &&
        (d as Record<string, unknown>).phase === "augment",
    );
    expect(augmentDump).toBeDefined();
  });
});

describe("createCompactionHooks - debug dump", () => {
  it("writes a debug dump when settings.debug is true", async () => {
    const h = makeHarness({ messages: convo(), settings: { debug: true } });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );
    expect(h.debugData.length).toBeGreaterThan(0);
  });

  it("does not write a debug dump when settings.debug is false", async () => {
    const h = makeHarness({ messages: convo(), settings: { debug: false } });
    const hooks = createCompactionHooks(h.deps);
    hooks.setPending("s1", { keepN: null });
    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );
    expect(h.debugData.length).toBe(0);
  });
});
