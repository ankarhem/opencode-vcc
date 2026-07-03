import { describe, it, expect } from "bun:test";
import { compileBrief } from "../src/core/brief";
import { normalize } from "../src/core/normalize";
import type { HistoryEntry } from "../src/core/render-entries";
import {
  userTextEntry,
  assistantTextEntry,
  bashEntry,
  assistantToolCallEntry,
  history,
} from "./fixtures";

describe("compileBrief", () => {
  it("returns empty string for no blocks", () => {
    expect(compileBrief(normalize(history()))).toBe("");
  });

  it("renders user and assistant text", () => {
    const r = compileBrief(
      normalize(
        history(
          userTextEntry("fix auth bug"),
          assistantTextEntry("Let me look at the auth module."),
        ),
      ),
    );
    expect(r).toContain("[user]");
    expect(r).toContain("fix auth bug");
    expect(r).toContain("[assistant]");
    expect(r).toContain("Let me look at the auth module.");
  });

  it("renders bash commands as user actions", () => {
    const r = compileBrief(
      normalize(history(bashEntry("npm test", "FAIL noisy output", 1))),
    );
    expect(r).toContain("[user]\n$ npm test (#0)");
    expect(r).not.toContain("FAIL noisy output");
  });

  it("strips filler prefixes but preserves meaningful lead-ins", () => {
    const r = compileBrief(
      normalize(
        history(
          assistantTextEntry("Okay, I found the root cause."),
          assistantTextEntry("Actually, the issue is in middleware."),
          assistantTextEntry("Let me check the logs."),
        ),
      ),
    );
    expect(r).toContain("I found the root cause.");
    expect(r).toContain("the issue is in middleware.");
    expect(r).toContain("Let me check the logs.");
  });

  it("collapses tool calls to one-liners under [assistant]", () => {
    const r = compileBrief(
      normalize(
        history(
          assistantTextEntry("Let me check."),
          assistantToolCallEntry("Read", { file_path: "auth.ts" }),
          assistantToolCallEntry("Edit", { file_path: "auth.ts" }),
        ),
      ),
    );
    expect(r).toContain('* Read "auth.ts"');
    expect(r).toContain('* Edit "auth.ts"');
    // Should merge into single [assistant] section
    const matches = r.match(/\[assistant\]/g);
    expect(matches?.length).toBe(1);
  });

  it("hides non-error tool results", () => {
    const r = compileBrief(
      normalize(
        history(
          assistantToolCallEntry(
            "Read",
            { file_path: "x.ts" },
            {
              status: "completed",
              output: "const x = 1;\nconst y = 2;\n// lots of code",
            },
          ),
        ),
      ),
    );
    // The tool call is shown, but its result body is omitted.
    expect(r).toContain('* Read "x.ts"');
    expect(r).not.toContain("const x = 1");
    expect(r).not.toContain("lots of code");
  });

  it("hides tool results regardless of status", () => {
    const r = compileBrief(
      normalize(
        history(
          assistantToolCallEntry(
            "Grep",
            { pattern: "auth" },
            {
              status: "error",
              output: "FAIL auth.test.ts\nexpected 200 got 401",
            },
          ),
        ),
      ),
    );
    expect(r).toContain('* Grep "auth"');
    expect(r).not.toContain("FAIL auth.test.ts");
    expect(r).not.toContain("expected 200 got 401");
  });

  it("merges adjacent assistant sections", () => {
    const r = compileBrief(
      normalize(
        history(
          assistantTextEntry("First part."),
          assistantToolCallEntry("Read", { file_path: "a.ts" }),
          // No user/tool_result between these — should merge
          assistantTextEntry("Second part."),
          assistantToolCallEntry("Read", { file_path: "b.ts" }),
        ),
      ),
    );
    const matches = r.match(/\[assistant\]/g);
    expect(matches?.length).toBe(1);
  });

  it("does NOT merge assistant after user", () => {
    const r = compileBrief(
      normalize(
        history(
          assistantTextEntry("First."),
          userTextEntry("Next task."),
          assistantTextEntry("Second."),
        ),
      ),
    );
    const matches = r.match(/\[assistant\]/g);
    expect(matches?.length).toBe(2);
  });

  it("truncates long user text", () => {
    const longText = Array.from({ length: 300 }, (_, i) => `word${i}`).join(
      " ",
    );
    const r = compileBrief(normalize(history(userTextEntry(longText))));
    expect(r).toContain("(truncated)");
    expect(r).not.toContain("word299");
  });

  it("truncates long assistant text", () => {
    const longText = Array.from({ length: 300 }, (_, i) => `word${i}`).join(
      " ",
    );
    const r = compileBrief(normalize(history(assistantTextEntry(longText))));
    expect(r).toContain("(truncated)");
    expect(r).not.toContain("word299");
  });

  it("renders a realistic conversation flow", () => {
    const r = compileBrief(
      normalize(
        history(
          userTextEntry("fix the login bug"),
          assistantTextEntry("Let me investigate."),
          assistantToolCallEntry(
            "Read",
            { file_path: "login.ts" },
            { status: "completed", output: "export function login() { ... }" },
          ),
          bashEntry(
            "npm test",
            "FAIL: login test\nExpected true, got false",
            1,
          ),
          assistantTextEntry("The test is failing because..."),
          assistantToolCallEntry(
            "Edit",
            { file_path: "login.ts" },
            { status: "completed", output: "File edited successfully" },
          ),
          userTextEntry("test lại đi"),
          assistantTextEntry("Running tests again."),
          bashEntry("npm test", "All tests passed", 0),
        ),
      ),
    );

    // Structure (bash renders as a [user] action in the opencode model)
    expect(r).toContain("[user]\nfix the login bug");
    expect(r).toContain(
      '[assistant]\nLet me investigate. (#1)\n* Read "login.ts" (#2)',
    );
    expect(r).toContain("$ npm test");
    expect(r).toContain("The test is failing because...");
    expect(r).toContain('* Edit "login.ts"');
    expect(r).toContain("test lại đi");
    expect(r).toContain("Running tests again.");

    // Hidden content: reasoning, tool result bodies, bash output
    expect(r).not.toContain("export function login");
    expect(r).not.toContain("File edited successfully");
    expect(r).not.toContain("All tests passed");
    expect(r).not.toContain("FAIL: login test");
  });

  it("suppresses blank lines between consecutive tool-only sections", () => {
    const r = compileBrief(
      normalize(
        history(
          assistantTextEntry("Checking files."),
          assistantToolCallEntry(
            "Read",
            { file_path: "a.ts" },
            { status: "completed", output: "..." },
          ),
          // tool_result hidden → next tool_call would start a new section,
          // but since all are assistant-role they merge into one.
          assistantToolCallEntry(
            "Read",
            { file_path: "b.ts" },
            { status: "completed", output: "..." },
          ),
        ),
      ),
    );
    expect(r.match(/\[assistant\]/g)?.length).toBe(1);
  });

  it("caps tool calls per [assistant] turn at 8 (keep tail)", () => {
    const entries: HistoryEntry[] = [assistantTextEntry("Working.")];
    for (let i = 1; i <= 12; i++) {
      entries.push(assistantToolCallEntry("Read", { file_path: `f${i}.ts` }));
    }
    const r = compileBrief(normalize(history(...entries)));
    expect(r).toContain("(4 earlier tool-call entries omitted)");
    // Last 8 (f5..f12) kept; first 4 dropped
    expect(r).not.toContain('f1.ts"');
    expect(r).not.toContain('f4.ts"');
    expect(r).toContain('f5.ts"');
    expect(r).toContain('f12.ts"');
  });

  it("does not cap when tool calls per turn <= 8", () => {
    const entries: HistoryEntry[] = [assistantTextEntry("ok")];
    for (let i = 1; i <= 8; i++) {
      entries.push(assistantToolCallEntry("Read", { file_path: `c${i}.ts` }));
    }
    const r = compileBrief(normalize(history(...entries)));
    expect(r).not.toContain("entries omitted");
    expect(r).toContain('c1.ts"');
    expect(r).toContain('c8.ts"');
  });
});
