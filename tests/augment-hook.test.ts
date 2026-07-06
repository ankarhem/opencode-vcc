import { describe, it, expect } from "bun:test";
import {
  createAugmentHooks,
  type AugmentHookDeps,
} from "../src/hooks/compaction";
import type { HistoryEntry } from "../src/core/render-entries";
import { RECALL_NOTE } from "../src/core/format";

const userEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "user" },
  parts: [{ type: "text", text }],
});

const summaryEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "assistant", summary: true, agent: "compaction" },
  parts: text ? [{ type: "text", text }] : [],
});

const assistantEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "assistant" },
  parts: [{ type: "text", text }],
});

const convo = (): HistoryEntry[] => [
  userEntry("u1", "Fix the login bug"),
  assistantEntry("a1", "Digging into the auth flow."),
  summaryEntry("sum_new", ""),
];

interface Harness {
  deps: AugmentHookDeps;
  getMessagesCalls: () => number;
}

function makeHarness(messages: HistoryEntry[]): Harness {
  const counters = { messages: 0 };
  const deps: AugmentHookDeps = {
    client: {
      session: {
        messages: async () => {
          counters.messages += 1;
          return messages;
        },
      },
    },
  };
  return { deps, getMessagesCalls: () => counters.messages };
}

const emptyOutput = (): { context: string[]; prompt?: string } => ({
  context: [],
});

describe("createAugmentHooks - compacting", () => {
  it("records the session as compacting (sets flag for text.complete)", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);
    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );
    // No prompt should be set — we don't override the compaction prompt.
    const output = emptyOutput();
    await hooks["experimental.session.compacting"]({ sessionID: "s1" }, output);
    expect(output.prompt).toBeUndefined();
  });
});

describe("createAugmentHooks - text.complete augment", () => {
  it("appends RECALL_NOTE to a compaction summary after compacting fires", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

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
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    const out = { text: "just a normal reply" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "a1", partID: "p" },
      out,
    );
    expect(out.text).toBe("just a normal reply");
  });

  it("does NOT append when compacting has not fired for the session", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

    const out = { text: "some text" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toBe("some text");
  });

  it("does not double-append when text.complete fires again", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    const out = { text: "LLM summary body." };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    // Second call — the session was already removed from compactingSessions.
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p2" },
      out,
    );
    const occurrences = out.text.split(RECALL_NOTE).length - 1;
    expect(occurrences).toBe(1);
  });

  it("prevents double-append with fresh output objects after augment", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

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
});

describe("createAugmentHooks - event cleanup", () => {
  it("cleans up compactingSessions on session.compacted", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    await hooks.event({
      event: { type: "session.compacted", properties: { sessionID: "s1" } },
    });

    // After cleanup, text.complete should NOT augment (session not in set).
    const out = { text: "post-cleanup text" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toBe("post-cleanup text");
  });

  it("cleans up compactingSessions on session.error", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    await hooks.event({
      event: { type: "session.error", properties: { sessionID: "s1" } },
    });

    const out = { text: "post-error text" };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toBe("post-error text");
  });

  it("ignores unrelated event types", async () => {
    const h = makeHarness(convo());
    const hooks = createAugmentHooks(h.deps);

    await hooks["experimental.session.compacting"](
      { sessionID: "s1" },
      emptyOutput(),
    );

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "s1" } },
    });

    // Session should still be in the set — augment still works.
    const out = { text: "LLM summary." };
    await hooks["experimental.text.complete"](
      { sessionID: "s1", messageID: "sum_new", partID: "p" },
      out,
    );
    expect(out.text).toContain(RECALL_NOTE);
  });
});
