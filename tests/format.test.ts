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

  it("instructs the agent to search before starting new work", () => {
    expect(RECALL_NOTE).toContain("Before starting new work");
  });

  it("lists searchable categories", () => {
    expect(RECALL_NOTE).toContain("decisions");
    expect(RECALL_NOTE).toContain("completed tasks");
    expect(RECALL_NOTE).toContain("file changes");
  });

  it("warns against redoing completed work", () => {
    expect(RECALL_NOTE).toContain("Do not redo completed work");
  });
});
