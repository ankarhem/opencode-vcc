import { describe, it, expect } from "bun:test";
import { loadAllMessages } from "../src/core/load-messages";
import type { HistoryEntry } from "../src/core/render-entries";

describe("loadAllMessages", () => {
  it("loads all message entries when no lineage filter is provided", () => {
    const history: HistoryEntry[] = [
      {
        info: { id: "m1", role: "user" },
        parts: [{ type: "text", text: "u1" }],
      },
      {
        info: { id: "m2", role: "assistant" },
        parts: [{ type: "text", text: "a1" }],
      },
      {
        info: { id: "m3", role: "user" },
        parts: [{ type: "text", text: "u2" }],
      },
    ];

    const loaded = loadAllMessages(history, false);
    expect(loaded.rendered).toHaveLength(3);
    expect(loaded.rawMessages).toHaveLength(3);
    expect(loaded.rendered.map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it("filters messages by allowed lineage entry IDs and preserves original message index", () => {
    const history: HistoryEntry[] = [
      {
        info: { id: "m1", role: "user" },
        parts: [{ type: "text", text: "u1" }],
      },
      {
        info: { id: "m2", role: "assistant" },
        parts: [{ type: "text", text: "a1" }],
      },
      {
        info: { id: "m3", role: "user" },
        parts: [{ type: "text", text: "u2" }],
      },
    ];

    const loaded = loadAllMessages(history, false, new Set(["m2"]));
    expect(loaded.rendered).toHaveLength(1);
    expect(loaded.rawMessages).toHaveLength(1);
    expect(loaded.rendered[0]?.index).toBe(1);
  });
});
