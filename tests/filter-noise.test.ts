import { describe, it, expect } from "bun:test";
import { filterNoise } from "../src/core/filter-noise";
import { normalize } from "../src/core/normalize";
import { userTextEntry, assistantToolCallEntry, history } from "./fixtures";

describe("filterNoise", () => {
  it("removes noise tool calls and results", () => {
    const blocks = normalize(
      history(
        assistantToolCallEntry(
          "TodoWrite",
          {},
          { status: "completed", output: "ok" },
        ),
        assistantToolCallEntry("Read", { path: "x.ts" }),
      ),
    );
    const result = filterNoise(blocks);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "tool_call",
      name: "Read",
      args: { path: "x.ts" },
      sourceIndex: 1,
    });
  });

  it("removes user blocks that are pure XML wrappers", () => {
    const blocks = normalize(
      history(
        userTextEntry("<system-reminder>some noise</system-reminder>"),
        userTextEntry("Fix the bug"),
      ),
    );
    const result = filterNoise(blocks);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "user",
      text: "Fix the bug",
      sourceIndex: 1,
    });
  });

  it("cleans XML wrappers from user text but keeps real content", () => {
    const blocks = normalize(
      history(
        userTextEntry(
          "<system-reminder>noise</system-reminder>\nFix the login",
        ),
      ),
    );
    const result = filterNoise(blocks);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "user",
      text: "Fix the login",
      sourceIndex: 0,
    });
  });

  it("removes known noise strings", () => {
    const blocks = normalize(
      history(
        userTextEntry("Continue from where you left off."),
        userTextEntry("real task"),
      ),
    );
    const result = filterNoise(blocks);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "user",
      text: "real task",
      sourceIndex: 1,
    });
  });

  it("preserves non-noise tool calls", () => {
    const blocks = normalize(
      history(
        assistantToolCallEntry(
          "Edit",
          { path: "a.ts" },
          { status: "completed", output: "ok" },
        ),
      ),
    );
    expect(filterNoise(blocks)).toHaveLength(2);
  });

  it("removes opencode-named noise tool calls (e.g. todowrite)", () => {
    const blocks = normalize(
      history(
        assistantToolCallEntry(
          "todowrite",
          { todos: [] },
          { status: "completed", output: "ok" },
        ),
        assistantToolCallEntry("Read", { path: "x.ts" }),
      ),
    );
    const result = filterNoise(blocks);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "tool_call",
      name: "Read",
      args: { path: "x.ts" },
      sourceIndex: 1,
    });
  });
});
