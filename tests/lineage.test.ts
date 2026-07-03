import { describe, it, expect } from "bun:test";
import { getLineageEntryIds, DEFAULT_RECALL_SCOPE } from "../src/core/lineage";

describe("getLineageEntryIds", () => {
  it("resolves the parent chain of the active (leaf) session", () => {
    const ids = getLineageEntryIds([
      { id: "root" },
      { id: "mid", parentID: "root" },
      { id: "leaf", parentID: "mid" },
    ]);
    expect([...ids].sort()).toEqual(["leaf", "mid", "root"]);
  });

  it("falls back to all ids when no session has a parentID", () => {
    const ids = getLineageEntryIds([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });

  it("returns an empty set for empty input", () => {
    const ids = getLineageEntryIds([]);
    expect(ids.size).toBe(0);
  });
});

describe("DEFAULT_RECALL_SCOPE", () => {
  it("defaults to lineage", () => {
    expect(DEFAULT_RECALL_SCOPE).toBe("lineage");
  });
});
