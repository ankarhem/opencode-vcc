import { describe, it, expect } from "bun:test";
import { renderMessage } from "../src/core/render-entries";
import type { HistoryEntry } from "../src/core/render-entries";

const userMsg = (text: string): HistoryEntry => ({
  info: { id: "u1", role: "user" },
  parts: [{ type: "text", text }],
});

const assistantText = (text: string): HistoryEntry => ({
  info: { id: "a1", role: "assistant" },
  parts: [{ type: "text", text }],
});

describe("renderMessage", () => {
  it("renders user message", () => {
    const r = renderMessage(userMsg("hello"), 0);
    expect(r).toEqual({ index: 0, role: "user", summary: "hello" });
  });

  it("renders assistant text", () => {
    const r = renderMessage(assistantText("done"), 1);
    expect(r.role).toBe("assistant");
    expect(r.summary).toBe("done");
  });

  it("renders a tool part with output like a tool result", () => {
    const entry: HistoryEntry = {
      info: { id: "a2", role: "assistant" },
      parts: [
        {
          type: "tool",
          tool: "Read",
          input: { path: "a.ts" },
          state: { status: "completed", output: "file contents" },
        },
      ],
    };
    const r = renderMessage(entry, 2);
    expect(r.role).toBe("assistant");
    expect(r.summary).toContain("[Read]");
    expect(r.summary).toContain("file contents");
  });

  it("renders tool call arguments with values when no output is present", () => {
    const entry: HistoryEntry = {
      info: { id: "a3", role: "assistant" },
      parts: [{ type: "tool", tool: "Read", input: { path: "a.ts" } }],
    };
    const r = renderMessage(entry, 2);
    expect(r.summary).toContain("Read(path=a.ts)");
  });

  it("renders a completed tool part output without extra prefix text", () => {
    const entry: HistoryEntry = {
      info: { id: "a4", role: "assistant" },
      parts: [
        {
          type: "tool",
          tool: "bash",
          input: { command: "ls" },
          state: { status: "completed", output: "not found" },
        },
      ],
    };
    const r = renderMessage(entry, 3);
    expect(r.summary).toBe("[bash] not found");
  });

  it("truncates long user text", () => {
    const long = "x".repeat(500);
    const r = renderMessage(userMsg(long), 0);
    expect(r.summary.length).toBeLessThanOrEqual(300);
  });

  it("extracts files from tool part inputs", () => {
    const entry: HistoryEntry = {
      info: { id: "a5", role: "assistant" },
      parts: [{ type: "tool", tool: "Read", input: { path: "src/x.ts" } }],
    };
    const r = renderMessage(entry, 4);
    expect(r.files).toEqual(["src/x.ts"]);
  });

  it("joins multiple tool lines with text after a newline", () => {
    const entry: HistoryEntry = {
      info: { id: "a6", role: "assistant" },
      parts: [
        { type: "tool", tool: "Read", input: { path: "a.ts" } },
        {
          type: "tool",
          tool: "Write",
          input: { path: "b.ts" },
          state: { status: "completed", output: "wrote" },
        },
        { type: "text", text: "summary text" },
      ],
    };
    const r = renderMessage(entry, 5);
    expect(r.summary).toContain("Read(path=a.ts)");
    expect(r.summary).toContain("[Write] wrote");
    expect(r.summary).toContain("summary text");
    expect(r.summary.endsWith("summary text")).toBe(true);
  });

  it("handles assistant message with no parts", () => {
    const entry: HistoryEntry = {
      info: { id: "a7", role: "assistant" },
      parts: [],
    };
    const r = renderMessage(entry, 3);
    expect(r.role).toBe("assistant");
    expect(r.summary).toBe("");
  });

  it("ignores reasoning parts when composing text summary", () => {
    const entry: HistoryEntry = {
      info: { id: "a8", role: "assistant" },
      parts: [
        { type: "reasoning", text: "internal thoughts" },
        { type: "text", text: "final answer" },
      ],
    };
    const r = renderMessage(entry, 6);
    expect(r.summary).toBe("final answer");
    expect(r.summary).not.toContain("internal thoughts");
  });
});
