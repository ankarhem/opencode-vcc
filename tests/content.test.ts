import { describe, it, expect } from "bun:test";
import {
  textParts,
  textOf,
  clip,
  clipSentence,
  nonEmptyLines,
  firstLine,
  snippet,
} from "../src/core/content";

describe("textParts", () => {
  it("returns [] for undefined content", () => {
    expect(textParts(undefined)).toEqual([]);
  });

  it("returns [] for null content", () => {
    expect(textParts(null)).toEqual([]);
  });

  it("wraps string content", () => {
    expect(textParts("hello")).toEqual(["hello"]);
  });

  it("extracts text parts from array content", () => {
    const content = [
      { type: "text" as const, text: "first" },
      { type: "toolCall" as const, name: "x", id: "1", arguments: {} },
      { type: "text" as const, text: "second" },
    ];
    expect(textParts(content)).toEqual(["first", "second"]);
  });
});

describe("textOf", () => {
  it("returns empty string for undefined content", () => {
    expect(textOf(undefined)).toBe("");
  });

  it("joins text parts with newline", () => {
    expect(
      textOf([
        { type: "text" as const, text: "first" },
        { type: "text" as const, text: "second" },
      ]),
    ).toBe("first\nsecond");
  });
});

describe("clip", () => {
  it("returns text unchanged when within limit", () => {
    expect(clip("hi", 200)).toBe("hi");
  });

  it("cuts at a word boundary when one falls in the acceptable range", () => {
    // space at index 10 is > max*0.6 (6.6), so end snaps to the space
    expect(clip("alpha beta gamma", 11)).toBe("alpha beta");
  });

  it("does not split a surrogate pair at the cut", () => {
    // "a😀b" length 4; max=2 puts the cut right after the high surrogate of 😀,
    // which must back up one to avoid leaving a lone surrogate.
    const out = clip("a😀b", 2);
    expect(out).toBe("a");
    expect(out).toHaveLength(1);
  });
});

describe("clipSentence", () => {
  it("returns text unchanged when within limit", () => {
    expect(clipSentence("short", 200)).toBe("short");
  });

  it("cuts at the last sentence boundary within [max*0.5, max]", () => {
    // period at index 10 -> end 11 >= max*0.5 (10), so it snaps to the sentence end
    expect(
      clipSentence("AAAAAAAAAA. BBBBBB CCCCCC DDDDDD EEEEEE FFFFFF", 20),
    ).toBe("AAAAAAAAAA.");
  });

  it("falls back to clip() when no sentence end is in the acceptable window", () => {
    // last sentence end (index 8 -> end 9) is below max*0.5 (10), so falls back to clip
    expect(clipSentence("One. Two. Three four five six.", 20)).toBe(
      "One. Two. Three four",
    );
  });
});

describe("nonEmptyLines", () => {
  it("trims and drops empty lines", () => {
    expect(nonEmptyLines("a\n\nb  \n  c")).toEqual(["a", "b", "c"]);
  });

  it("returns [] for all-blank input", () => {
    expect(nonEmptyLines("  \n  ")).toEqual([]);
  });
});

describe("firstLine", () => {
  it("returns the first line", () => {
    expect(firstLine("hello world\nsecond")).toBe("hello world");
  });

  it("clips the first line to max", () => {
    expect(firstLine("abcdef", 3)).toBe("abc");
  });
});

describe("snippet", () => {
  it("returns null when the term is absent", () => {
    expect(snippet("hello world", "zzz")).toBe(null);
  });

  it("wraps the match with ... prefix and suffix", () => {
    expect(snippet("the quick brown fox jumps", "brown", 3)).toBe(
      "...ck brown fo...",
    );
  });

  it("omits the prefix when the match is at the start", () => {
    expect(snippet("brown fox", "brown", 3)).toBe("brown fo...");
  });
});
