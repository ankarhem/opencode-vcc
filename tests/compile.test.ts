import { describe, it, expect } from "bun:test";
import { compile } from "../src/core/summarize";
import {
  userTextEntry,
  assistantTextEntry,
  assistantToolCallEntry,
  history,
} from "./fixtures";

describe("compile", () => {
  it("returns empty string for no messages", () => {
    expect(compile({ messages: history() })).toBe("");
  });

  it("produces hybrid output with header + brief transcript", () => {
    const r = compile({
      messages: history(
        userTextEntry("Fix login bug"),
        assistantToolCallEntry("Read", { path: "auth.ts" }),
        assistantTextEntry("Found the issue.\n1. Fix validation"),
      ),
    });
    expect(r).toContain("[Session Goal]");
    expect(r).toContain("Fix login bug");
    expect(r).toContain("---");
    expect(r).toContain("[user]\nFix login bug");
    expect(r).toContain('* Read "auth.ts"');
    expect(r).toContain("Found the issue.");
  });

  it("merges previous summary goals", () => {
    const r = compile({
      messages: history(userTextEntry("New task")),
      previousSummary:
        "[Session Goal]\n- Original goal\n\n---\n\n[user]\nOriginal goal",
    });
    expect(r).toContain("- Original goal");
    expect(r).toContain("- New task");
  });

  it("appends brief transcript on merge", () => {
    const previousSummary = [
      "[Session Goal]\n- Original goal",
      "---",
      '[user]\nOriginal goal\n\n[assistant]\n* Read "old.ts"',
    ].join("\n\n");
    const r = compile({
      previousSummary,
      messages: history(
        userTextEntry("Next step"),
        assistantToolCallEntry("Read", { path: "new.ts" }),
      ),
    });
    expect(r).toContain('* Read "old.ts"');
    expect(r).toContain('* Read "new.ts"');
    expect(r).toContain("Next step");
  });

  it("outstanding context is volatile (fresh only)", () => {
    const previousSummary =
      "[Outstanding Context]\n- old blocker\n\n---\n\n[user]\nhi";
    const r = compile({
      previousSummary,
      messages: history(userTextEntry("continue")),
    });
    expect(r).not.toContain("old blocker");
  });

  it("caps long brief transcript with rolling window", () => {
    // Build a very long previous transcript
    const longTranscript = Array.from(
      { length: 200 },
      (_, i) => `[user]\nmessage ${i}`,
    ).join("\n\n");
    const previousSummary = `[Session Goal]\n- goal\n\n---\n\n${longTranscript}`;
    const r = compile({
      previousSummary,
      messages: history(userTextEntry("latest")),
    });
    expect(r).toContain("earlier lines omitted");
    expect(r).toContain("latest");
  });

  it("wraps final output including recall note", () => {
    const r = compile({
      messages: history(userTextEntry("check final summary wrapping")),
    });
    const maxLineLength = Math.max(...r.split("\n").map((line) => line.length));
    expect(r).toContain("vcc_recall");
    expect(maxLineLength).toBeLessThanOrEqual(120);
    // RECALL_NOTE is appended exactly once at the very end.
    expect(r.split("vcc_recall").length - 1).toBe(1);
  });
});
