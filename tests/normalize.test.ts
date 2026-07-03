import { describe, it, expect } from "bun:test";
import { normalize } from "../src/core/normalize";
import type { HistoryEntry } from "../src/core/render-entries";
import {
  userTextEntry,
  assistantTextEntry,
  assistantWithReasoningEntry,
  assistantToolCallEntry,
  bashEntry,
  history,
} from "./fixtures";

describe("normalize", () => {
  it("returns empty for empty input", () => {
    expect(normalize([])).toEqual([]);
  });

  it("normalizes a user message into one user block", () => {
    const blocks = normalize(history(userTextEntry("fix the bug")));
    expect(blocks).toEqual([
      { kind: "user", text: "fix the bug", sourceIndex: 0 },
    ]);
  });

  it("emits an empty user block when the user message has no content", () => {
    const entry: HistoryEntry = {
      info: { id: "u1", role: "user" },
      parts: [],
    };
    expect(normalize([entry])).toEqual([
      { kind: "user", text: "", sourceIndex: 0 },
    ]);
  });

  it("normalizes an assistant text message", () => {
    const blocks = normalize(history(assistantTextEntry("done")));
    expect(blocks).toEqual([
      { kind: "assistant", text: "done", sourceIndex: 0 },
    ]);
  });

  it("drops assistant reasoning parts entirely", () => {
    const blocks = normalize(history(assistantWithReasoningEntry("result")));
    expect(blocks).toEqual([
      { kind: "assistant", text: "result", sourceIndex: 0 },
    ]);
    // reasoning content must not leak into any block
    expect(JSON.stringify(blocks)).not.toContain("internal thoughts");
  });

  it("normalizes a non-bash tool call into a tool_call block", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Read", { path: "a.ts" })),
    );
    expect(blocks).toEqual([
      {
        kind: "tool_call",
        name: "Read",
        args: { path: "a.ts" },
        sourceIndex: 0,
      },
    ]);
  });

  it("emits tool_call THEN tool_result for a completed tool part", () => {
    const blocks = normalize(
      history(
        assistantToolCallEntry(
          "Read",
          { path: "a.ts" },
          { status: "completed", output: "file contents" },
        ),
      ),
    );
    expect(blocks).toEqual([
      {
        kind: "tool_call",
        name: "Read",
        args: { path: "a.ts" },
        sourceIndex: 0,
      },
      {
        kind: "tool_result",
        name: "Read",
        text: "file contents",
        sourceIndex: 0,
      },
    ]);
  });

  it("normalizes a bash tool part into a single bash block", () => {
    const blocks = normalize(history(bashEntry("ls -la", "files", 0)));
    expect(blocks).toEqual([
      {
        kind: "bash",
        command: "ls -la",
        output: "files",
        exitCode: 0,
        sourceIndex: 0,
      },
    ]);
  });

  it("marks a failed bash tool part with exitCode 1", () => {
    const blocks = normalize(history(bashEntry("false", "", 1)));
    expect(blocks).toEqual([
      {
        kind: "bash",
        command: "false",
        output: "",
        exitCode: 1,
        sourceIndex: 0,
      },
    ]);
  });

  it("handles a mixed message sequence in order", () => {
    const blocks = normalize(
      history(
        userTextEntry("fix it"),
        assistantToolCallEntry(
          "Read",
          { path: "x.ts" },
          { status: "completed", output: "code" },
        ),
        assistantTextEntry("done"),
      ),
    );
    expect(blocks).toHaveLength(4);
    expect(blocks.map((b) => b.kind)).toEqual([
      "user",
      "tool_call",
      "tool_result",
      "assistant",
    ]);
    expect(blocks.map((b) => b.sourceIndex)).toEqual([0, 1, 1, 2]);
  });

  it("produces an image placeholder for user file parts", () => {
    const entry: HistoryEntry = {
      info: { id: "u2", role: "user" },
      parts: [
        { type: "text", text: "look at this" },
        { type: "file", mime: "image/png", url: "data:..." },
      ],
    };
    const blocks = normalize([entry]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: "user",
      text: "look at this",
      sourceIndex: 0,
    });
    expect(blocks[1]).toEqual({
      kind: "user",
      text: "[image: image/png]",
      sourceIndex: 0,
    });
  });

  it("falls back to unknown mime when a file part has no mime field", () => {
    const entry: HistoryEntry = {
      info: { id: "u3", role: "user" },
      parts: [{ type: "file", url: "data:..." }],
    };
    expect(normalize([entry])).toEqual([
      { kind: "user", text: "[image: unknown]", sourceIndex: 0 },
    ]);
  });

  it("returns [] for an empty assistant message", () => {
    const entry: HistoryEntry = {
      info: { id: "a9", role: "assistant" },
      parts: [],
    };
    expect(normalize([entry])).toEqual([]);
  });
});
