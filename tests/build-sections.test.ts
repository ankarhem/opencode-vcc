import { describe, it, expect } from "bun:test";
import { buildSections } from "../src/core/build-sections";
import { normalize } from "../src/core/normalize";
import {
  userTextEntry,
  assistantTextEntry,
  bashEntry,
  assistantToolCallEntry,
  history,
} from "./fixtures";

describe("buildSections", () => {
  it("returns all-empty for no blocks", () => {
    const r = buildSections({ blocks: normalize(history()) });
    expect(r.sessionGoal).toEqual([]);
    expect(r.outstandingContext).toEqual([]);
    expect(r.filesAndChanges).toEqual([]);
    expect(r.commits).toEqual([]);
    expect(r.userPreferences).toEqual([]);
    expect(r.briefTranscript).toBe("");
  });

  it("populates sections from realistic blocks", () => {
    const r = buildSections({
      blocks: normalize(
        history(
          userTextEntry("Fix the auth bug"),
          assistantToolCallEntry(
            "Read",
            { file_path: "auth.ts" },
            { status: "completed", output: "const x = 1;" },
          ),
          assistantToolCallEntry(
            "Edit",
            { file_path: "auth.ts" },
            { status: "completed", output: "ok" },
          ),
          // Assistant blocker line → outstandingContext
          assistantTextEntry("The auth tests are still failing after the fix."),
          // A commit via bash → commits
          bashEntry('git commit -m "fix auth"', "[main abc1234] fix auth", 0),
          // A user preference → userPreferences
          userTextEntry("Always use functional components"),
        ),
      ),
    });

    // sessionGoal
    expect(r.sessionGoal).toContain("Fix the auth bug");
    // outstandingContext (assistant blocker)
    expect(r.outstandingContext.length).toBeGreaterThan(0);
    // filesAndChanges (Read + Edit to auth.ts)
    expect(
      r.filesAndChanges.some(
        (l) => l.startsWith("Modified:") && l.includes("auth.ts"),
      ),
    ).toBe(true);
    expect(
      r.filesAndChanges.some(
        (l) => l.startsWith("Read:") && l.includes("auth.ts"),
      ),
    ).toBe(true);
    // commits
    expect(r.commits.some((l) => l.includes("fix auth"))).toBe(true);
    // userPreferences
    expect(r.userPreferences).toContain("Always use functional components");
    // briefTranscript
    expect(r.briefTranscript).toContain("[user]");
    expect(r.briefTranscript).toContain("[assistant]");
    expect(r.briefTranscript).toContain('* Read "auth.ts"');
    expect(r.briefTranscript).toContain('* Edit "auth.ts"');
  });

  it("captures outstanding context from an assistant blocker line", () => {
    const r = buildSections({
      blocks: normalize(
        history(assistantTextEntry("Tests are still failing after the retry.")),
      ),
    });
    expect(r.outstandingContext.length).toBeGreaterThan(0);
    expect(r.outstandingContext[0]).toContain("Tests are still failing");
  });

  it("brief transcript hides tool_result content", () => {
    const r = buildSections({
      blocks: normalize(
        history(
          assistantToolCallEntry(
            "Read",
            { file_path: "x.ts" },
            { status: "completed", output: "SECRET_RESULT_BODY_XYZ" },
          ),
          assistantToolCallEntry(
            "Grep",
            { pattern: "auth" },
            { status: "error", output: "FAIL auth.test.ts found" },
          ),
        ),
      ),
    });
    // Tool call summaries appear, but their result bodies do not.
    expect(r.briefTranscript).not.toContain("SECRET_RESULT_BODY_XYZ");
    expect(r.briefTranscript).not.toContain("FAIL auth.test.ts");
  });

  it("brief transcript merges adjacent assistant tool calls", () => {
    const r = buildSections({
      blocks: normalize(
        history(
          assistantTextEntry("Part one."),
          assistantToolCallEntry("Read", { file_path: "a.ts" }),
          assistantTextEntry("Part two."),
        ),
      ),
    });
    const matches = r.briefTranscript.match(/\[assistant\]/g);
    expect(matches?.length).toBe(1);
  });

  it("filesAndChanges: modified supersedes created (Write then Edit to same file)", () => {
    const r = buildSections({
      blocks: normalize(
        history(
          assistantToolCallEntry(
            "Write",
            { file_path: "src/X.ts" },
            { status: "completed", output: "ok" },
          ),
          assistantToolCallEntry(
            "Edit",
            { file_path: "src/X.ts" },
            { status: "completed", output: "ok" },
          ),
        ),
      ),
    });
    // X appears in Modified only, not Created.
    expect(
      r.filesAndChanges.some(
        (l) => l.startsWith("Modified:") && l.includes("X.ts"),
      ),
    ).toBe(true);
    expect(
      r.filesAndChanges.some(
        (l) => l.startsWith("Created:") && l.includes("X.ts"),
      ),
    ).toBe(false);
  });
});
