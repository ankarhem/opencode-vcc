import { describe, it, expect } from "bun:test";
import { parseKeepAndPrompt } from "../src/core/compact-args";

describe("parseKeepAndPrompt", () => {
  it("returns all defaults for empty string", () => {
    expect(parseKeepAndPrompt("")).toEqual({
      followUpPrompt: "",
      keepUserTurns: null,
      keepUserTurnsExplicit: false,
    });
  });

  it("returns all defaults for undefined", () => {
    expect(parseKeepAndPrompt(undefined)).toEqual({
      followUpPrompt: "",
      keepUserTurns: null,
      keepUserTurnsExplicit: false,
    });
  });

  it("returns all defaults for whitespace-only input", () => {
    expect(parseKeepAndPrompt("   \t  ")).toEqual({
      followUpPrompt: "",
      keepUserTurns: null,
      keepUserTurnsExplicit: false,
    });
  });

  it("parses a lone leading keep:3 (no follow-up)", () => {
    expect(parseKeepAndPrompt("keep:3")).toEqual({
      followUpPrompt: "",
      keepUserTurns: 3,
      keepUserTurnsExplicit: true,
    });
  });

  it("parses leading keep:3 with a follow-up prompt", () => {
    expect(parseKeepAndPrompt("keep:3 do the thing")).toEqual({
      followUpPrompt: "do the thing",
      keepUserTurns: 3,
      keepUserTurnsExplicit: true,
    });
  });

  it("parses trailing keep:2 with a leading prompt", () => {
    expect(parseKeepAndPrompt("do thing keep:2")).toEqual({
      followUpPrompt: "do thing",
      keepUserTurns: 2,
      keepUserTurnsExplicit: true,
    });
  });

  it("parses a lone keep:5 token", () => {
    expect(parseKeepAndPrompt("keep:5")).toEqual({
      followUpPrompt: "",
      keepUserTurns: 5,
      keepUserTurnsExplicit: true,
    });
  });

  it("parses keep:0 explicitly", () => {
    expect(parseKeepAndPrompt("keep:0")).toEqual({
      followUpPrompt: "",
      keepUserTurns: 0,
      keepUserTurnsExplicit: true,
    });
  });

  it("treats a plain string (no keep token) as the follow-up prompt", () => {
    expect(parseKeepAndPrompt("just a follow up prompt")).toEqual({
      followUpPrompt: "just a follow up prompt",
      keepUserTurns: null,
      keepUserTurnsExplicit: false,
    });
  });

  it("does not treat a mid-string keep:N as a token", () => {
    // keep:9 is neither the leading nor the trailing token → plain prompt.
    const r = parseKeepAndPrompt("please keep:9 things tidy");
    expect(r.keepUserTurns).toBeNull();
    expect(r.keepUserTurnsExplicit).toBe(false);
    expect(r.followUpPrompt).toBe("please keep:9 things tidy");
  });

  it("clamps a non-safe-integer keep to MAX_SAFE_INTEGER", () => {
    const r = parseKeepAndPrompt("keep:99999999999999999999");
    expect(r.keepUserTurns).toBe(Number.MAX_SAFE_INTEGER);
    expect(r.keepUserTurnsExplicit).toBe(true);
    expect(r.followUpPrompt).toBe("");
  });

  it("clamps a non-safe-integer trailing keep too", () => {
    const r = parseKeepAndPrompt("wrap up keep:99999999999999999999");
    expect(r.keepUserTurns).toBe(Number.MAX_SAFE_INTEGER);
    expect(r.keepUserTurnsExplicit).toBe(true);
    expect(r.followUpPrompt).toBe("wrap up");
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseKeepAndPrompt("  keep:4   go  ")).toEqual({
      followUpPrompt: "go",
      keepUserTurns: 4,
      keepUserTurnsExplicit: true,
    });
  });
});
