import { describe, it, expect } from "bun:test";
import { formatSummary, capBrief, wrapLongLines, RECALL_NOTE } from "../src/core/format";
import type { SectionData } from "../src/core/sections";

const empty: SectionData = {
  sessionGoal: [],
  outstandingContext: [],
  filesAndChanges: [],
  commits: [],
  userPreferences: [],
  briefTranscript: "",
};

describe("formatSummary", () => {
  it("returns empty string for all-empty sections", () => {
    expect(formatSummary(empty)).toBe("");
  });

  it("formats a single header section", () => {
    const data = {
      ...empty,
      sessionGoal: ["fix auth bug"],
    };
    const r = formatSummary(data);
    expect(r).toContain("[Session Goal]");
    expect(r).toContain("- fix auth bug");
  });

  it("separates header and brief transcript with ---", () => {
    const data = {
      ...empty,
      sessionGoal: ["goal"],
      briefTranscript: "[user]\ndo something",
    };
    const r = formatSummary(data);
    expect(r).toContain("[Session Goal]");
    expect(r).toContain("---");
    expect(r).toContain("[user]\ndo something");
  });

  it("renders brief transcript alone when no header sections", () => {
    const data = {
      ...empty,
      briefTranscript: "[user]\nhi\n\n[assistant]\nhello",
    };
    const r = formatSummary(data);
    expect(r).toContain("[user]\nhi\n\n[assistant]\nhello");
  });

  it("joins multiple header sections with blank line", () => {
    const data = {
      ...empty,
      sessionGoal: ["goal"],
      outstandingContext: ["blocker"],
    };
    const r = formatSummary(data);
    expect(r).toContain("[Session Goal]");
    expect(r).toContain("[Outstanding Context]");
    expect(r).toContain("\n\n");
  });

  it("wraps long lines so compaction TUI rendering stays bounded", () => {
    const data = {
      ...empty,
      briefTranscript: `[assistant]\n${"word ".repeat(80)}`,
    };
    const r = formatSummary(data);
    expect(Math.max(...r.split("\n").map((line) => line.length))).toBeLessThanOrEqual(120);
  });
});

describe("capBrief", () => {
  it("returns text unchanged when at or below the line cap", () => {
    const text = Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n");
    expect(capBrief(text)).toBe(text);
  });

  it("cuts to the last 120 lines, drops lines before the first header, and prepends an omission note", () => {
    // Lines entirely before the kept 120-line window: dropped by the slice itself.
    const junkBeforeWindow = Array.from({ length: 10 }, (_, i) => `ancient junk ${i}`);
    // Lines inside the kept window but before the first header: dropped by the
    // header-seeking logic.
    const junkInWindow = ["stray a", "stray b", "stray c"];
    const header = "[assistant]";
    const bodyLines = Array.from({ length: 116 }, (_, i) => `body line ${i}`);
    const lines = [...junkBeforeWindow, ...junkInWindow, header, ...bodyLines];
    const text = lines.join("\n");

    const result = capBrief(text);

    const omitted = lines.length - 120;
    expect(result.startsWith(`...(${omitted} earlier lines omitted)\n\n`)).toBe(true);
    expect(result).not.toContain("ancient junk");
    expect(result).not.toContain("stray a");
    expect(result).not.toContain("stray b");
    expect(result).not.toContain("stray c");
    expect(result).toContain(header);
    expect(result).toContain("body line 115");
  });
});

describe("wrapLongLines", () => {
  it("wraps lines longer than maxChars at word boundaries", () => {
    const line = "word ".repeat(40).trimEnd();
    const wrapped = wrapLongLines(line, 40);
    for (const l of wrapped.split("\n")) {
      expect(l.length).toBeLessThanOrEqual(40);
    }
    // Reassembling (accounting for wrap-inserted breaks) should preserve all words.
    expect(wrapped.replace(/\n/g, " ")).toContain("word");
  });

  it("leaves short lines untouched", () => {
    expect(wrapLongLines("short line", 120)).toBe("short line");
  });
});

describe("RECALL_NOTE", () => {
  it("has the exact expected wording referencing vcc_recall", () => {
    expect(RECALL_NOTE).toBe(
      "Use `vcc_recall` to search for prior work, decisions, and context from before this summary. Do not redo work already completed.",
    );
  });
});
