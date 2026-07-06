import { describe, it, expect } from "bun:test";
import {
  createRecallTool,
  invalidExpandIndices,
  type RecallToolDeps,
} from "../src/tools/recall";
import type { ToolContext, ToolResult } from "@opencode-ai/plugin";
import type { HistoryEntry } from "../src/core/render-entries";

// -- fixtures --
const userEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "user" },
  parts: [{ type: "text", text }],
});

const assistantEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "assistant" },
  parts: [{ type: "text", text }],
});

const mkDeps = (messages: HistoryEntry[]): RecallToolDeps => ({
  client: { session: { messages: async () => messages } },
});

const mkCtx = (sessionID: string): ToolContext => ({
  sessionID,
  messageID: "m",
  agent: "test",
  directory: "/tmp",
  worktree: "/tmp",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
});

/** Unwrap a ToolResult (string | { output }) to its text. */
const out = (r: ToolResult): string => (typeof r === "string" ? r : r.output);

const manyEntries = (count: number, prefix = "msg"): HistoryEntry[] => {
  const list: HistoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    list.push(userEntry(`u${i}`, `${prefix}-${i}`));
  }
  return list;
};

describe("recall tool - browse mode", () => {
  it("returns the last 25 entries when no query/expand given", async () => {
    const t = createRecallTool(mkDeps(manyEntries(30)));
    const r = out(await t.execute({}, mkCtx("s1")));
    expect(r).toContain("Session history (25 entries)");
    expect(r).toContain("msg-29");
    expect(r).toContain("msg-5");
    expect(r).not.toContain("msg-4");
  });

  it("returns all entries when fewer than 25 exist", async () => {
    const t = createRecallTool(
      mkDeps([userEntry("u0", "alpha"), assistantEntry("a0", "beta")]),
    );
    const r = out(await t.execute({}, mkCtx("s1")));
    expect(r).toContain("Session history (2 entries)");
    expect(r).toContain("alpha");
  });

  it("returns 'No entries' message for empty history", async () => {
    const t = createRecallTool(mkDeps([]));
    const r = out(await t.execute({}, mkCtx("s1")));
    expect(r).toContain("No entries in session history");
  });
});

describe("recall tool - search mode", () => {
  it("returns matches with a count header for a single page", async () => {
    const t = createRecallTool(
      mkDeps([
        userEntry("u0", "fix the alpha bug"),
        assistantEntry("a0", "looking at alpha code"),
        userEntry("u1", "alpha is tricky"),
      ]),
    );
    const r = out(await t.execute({ query: "alpha" }, mkCtx("s1")));
    expect(r).toContain("3 matches");
    expect(r).toContain("alpha");
  });

  it("paginates 5 per page and shows page header + footer", async () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 7; i++) {
      history.push(userEntry(`u${i}`, `alpha entry ${i}`));
    }
    const t = createRecallTool(mkDeps(history));

    const r1 = out(await t.execute({ query: "alpha", page: 1 }, mkCtx("s1")));
    expect(r1).toContain("Page 1/2 (7 total matches)");
    expect(r1).toContain("Use page:2");

    const r2 = out(await t.execute({ query: "alpha", page: 2 }, mkCtx("s1")));
    expect(r2).toContain("Page 2/2 (7 total matches)");
    expect(r2).not.toContain("Use page:3");
  });

  it("page 2 returns a different slice than page 1", async () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 7; i++) {
      history.push(userEntry(`u${i}`, `alpha entry ${i}`));
    }
    const t = createRecallTool(mkDeps(history));
    const r1 = out(await t.execute({ query: "alpha", page: 1 }, mkCtx("s1")));
    const r2 = out(await t.execute({ query: "alpha", page: 2 }, mkCtx("s1")));
    expect(r1).toContain("alpha entry 0");
    expect(r2).toContain("alpha entry 5");
  });

  it("returns no-match message when query has no hits", async () => {
    const t = createRecallTool(mkDeps([userEntry("u0", "hello world")]));
    const r = out(await t.execute({ query: "zzznomatch" }, mkCtx("s1")));
    expect(r).toContain("No matches");
  });
});

describe("recall tool - expand mode", () => {
  const longOutput = "X".repeat(300) + "-FULL-DETAIL-END";

  it("returns full untruncated content for a valid expand index", async () => {
    const history: HistoryEntry[] = [
      userEntry("u0", "question"),
      {
        info: { id: "a0", role: "assistant" },
        parts: [
          { type: "text", text: "short text" },
          {
            type: "tool",
            tool: "Read",
            input: { path: "/foo" },
            state: { status: "completed", output: longOutput },
          },
        ],
      },
    ];
    const t = createRecallTool(mkDeps(history));
    const r = out(await t.execute({ expand: [1] }, mkCtx("s1")));
    expect(r).toContain("FULL-DETAIL-END");
  });

  it("clips that same content in browse mode (not expand)", async () => {
    const history: HistoryEntry[] = [
      {
        info: { id: "a0", role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "Read",
            input: { path: "/foo" },
            state: { status: "completed", output: longOutput },
          },
        ],
      },
    ];
    const t = createRecallTool(mkDeps(history));
    const r = out(await t.execute({}, mkCtx("s1")));
    expect(r).not.toContain("FULL-DETAIL-END");
  });

  it("returns error text for an invalid expand index", async () => {
    const t = createRecallTool(
      mkDeps([userEntry("u0", "hi"), assistantEntry("a0", "yo")]),
    );
    const r = out(await t.execute({ expand: [99] }, mkCtx("s1")));
    expect(r).toContain("Cannot expand indices outside");
    expect(r).toContain("99");
  });
});

describe("invalidExpandIndices (exported helper)", () => {
  it("rejects indices not present in the available set", () => {
    expect(invalidExpandIndices([0, 1, 5], new Set([0, 1, 2]))).toEqual([5]);
  });

  it("rejects non-integer values", () => {
    expect(invalidExpandIndices([1.5, 2], new Set([1, 2]))).toEqual([1.5]);
  });

  it("returns empty when all indices are valid", () => {
    expect(invalidExpandIndices([0, 1, 2], new Set([0, 1, 2]))).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(invalidExpandIndices([], new Set([0, 1]))).toEqual([]);
  });
});
