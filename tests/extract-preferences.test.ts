import { describe, it, expect } from "bun:test";
import {
  dedupPreferencesAgainstGoals,
  extractPreferences,
} from "../src/extract/preferences";
import { normalize } from "../src/core/normalize";
import { assistantTextEntry, history, userTextEntry } from "./fixtures";

describe("extractPreferences", () => {
  it("returns empty for no blocks", () => {
    expect(extractPreferences([])).toEqual([]);
  });

  it("captures preference patterns from user", () => {
    const blocks = normalize(
      history(userTextEntry("I prefer TypeScript over JavaScript")),
    );
    expect(extractPreferences(blocks).length).toBe(1);
  });

  it("ignores assistant blocks", () => {
    const blocks = normalize(
      history(assistantTextEntry("I always use best practices")),
    );
    expect(extractPreferences(blocks)).toEqual([]);
  });

  it("captures please use pattern", () => {
    const blocks = normalize(
      history(userTextEntry("please use bun instead of node")),
    );
    expect(extractPreferences(blocks).length).toBe(1);
  });
});

describe("dedupPreferencesAgainstGoals", () => {
  it("removes preferences that duplicate a goal and keeps the rest", () => {
    const result = dedupPreferencesAgainstGoals(
      ["I prefer TypeScript", "always use strict types"],
      ["I prefer TypeScript"],
    );
    expect(result).toEqual(["always use strict types"]);
  });
});
