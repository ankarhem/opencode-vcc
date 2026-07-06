import { describe, it, expect } from "bun:test";
import { RECALL_NOTE } from "../src/core/format";

describe("RECALL_NOTE", () => {
  it("references the recall tool", () => {
    expect(RECALL_NOTE).toContain("`recall`");
  });

  it("starts with IMPORTANT to signal priority", () => {
    expect(RECALL_NOTE.startsWith("IMPORTANT:")).toBe(true);
  });

  it("mentions compaction as the reason context may be incomplete", () => {
    expect(RECALL_NOTE.toLowerCase()).toContain("compact");
  });

  it("says to use the recall tool to search pre-compaction context", () => {
    expect(RECALL_NOTE).toContain(
      "Use the `recall` tool to search in the pre-compaction context",
    );
  });

  it("warns against redoing work already completed", () => {
    expect(RECALL_NOTE).toContain("Do not redo work already completed");
  });
});
