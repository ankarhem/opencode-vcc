import { describe, it, expect } from "bun:test";
import { extractGoals } from "../src/extract/goals";
import { normalize } from "../src/core/normalize";
import { assistantTextEntry, history, userTextEntry } from "./fixtures";

describe("extractGoals", () => {
  it("returns empty for no blocks", () => {
    expect(extractGoals([])).toEqual([]);
  });

  it("returns empty when no user blocks", () => {
    const blocks = normalize(history(assistantTextEntry("hello")));
    expect(extractGoals(blocks)).toEqual([]);
  });

  it("extracts first user message lines as goals", () => {
    const blocks = normalize(
      history(userTextEntry("Fix login bug\nCheck auth flow")),
    );
    const goals = extractGoals(blocks);
    expect(goals).toEqual(["Fix login bug", "Check auth flow"]);
  });

  it("takes up to 6 lines from first user block", () => {
    const blocks = normalize(
      history(
        userTextEntry(
          "fix the login bug\ncheck auth flow\nupdate the tests\nrefactor utils\nclean up",
        ),
      ),
    );
    expect(extractGoals(blocks)).toHaveLength(5);
  });

  it("ignores subsequent user blocks", () => {
    const blocks = normalize(
      history(
        userTextEntry("first goal"),
        assistantTextEntry("ok"),
        userTextEntry("second request"),
      ),
    );
    expect(extractGoals(blocks)).toEqual(["first goal"]);
  });

  it("detects scope change with explicit pivot keywords", () => {
    const blocks = normalize(
      history(
        userTextEntry("Fix login bug"),
        assistantTextEntry("ok"),
        userTextEntry("Actually, instead let's refactor the auth module"),
      ),
    );
    const goals = extractGoals(blocks);
    expect(goals).toContain("Fix login bug");
    expect(goals).toContain("[Scope change]");
    expect(goals.some((g) => g.includes("refactor"))).toBe(true);
  });

  it("detects scope change from new task statements", () => {
    const blocks = normalize(
      history(
        userTextEntry("Fix login bug"),
        assistantTextEntry("done"),
        userTextEntry("Now implement the user registration flow"),
      ),
    );
    const goals = extractGoals(blocks);
    expect(goals).toContain("[Scope change]");
  });

  it("keeps latest scope change only", () => {
    const blocks = normalize(
      history(
        userTextEntry("Fix login bug"),
        assistantTextEntry("done"),
        userTextEntry("Actually, fix the signup page instead"),
        assistantTextEntry("ok"),
        userTextEntry("Change of plan, implement password reset"),
      ),
    );
    const goals = extractGoals(blocks);
    const scopeIdx = goals.indexOf("[Scope change]");
    expect(goals[scopeIdx + 1] ?? "").toContain("password reset");
  });

  it("skips noise short user messages as goals", () => {
    const blocks = normalize(
      history(
        userTextEntry("ok"),
        assistantTextEntry("hello"),
        userTextEntry("Fix the authentication module"),
      ),
    );
    const goals = extractGoals(blocks);
    expect(goals[0] ?? "").toContain("Fix the authentication");
    expect(goals.some((g) => g === "ok")).toBe(false);
  });

  it("caps total goals at 8", () => {
    // First block seeds up to 6 goals; a scope-change block contributes a
    // "[Scope change]" marker plus up to 3 lines (10 total) — sliced to 8.
    const blocks = normalize(
      history(
        userTextEntry(
          "fix the login bug\ncheck the auth flow\nupdate all the tests\nrefactor the utils file\nclean up the imports\nadd more logging",
        ),
        assistantTextEntry("ok"),
        userTextEntry(
          "Actually, instead let's pivot to new work\ndo task alpha first\nthen do task beta\nfinally do task gamma",
        ),
      ),
    );
    expect(extractGoals(blocks)).toHaveLength(8);
  });
});
