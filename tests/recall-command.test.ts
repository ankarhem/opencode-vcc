import { describe, it, expect } from "bun:test";
import {
  createRecallCommandHook,
  buildRecallCommandOutput,
  recallCommandConfig,
  RECALL_COMMAND,
} from "../src/commands/recall";
import type { HistoryEntry } from "../src/core/render-entries";

const userEntry = (id: string, text: string): HistoryEntry => ({
  info: { id, role: "user" },
  parts: [{ type: "text", text }],
});

const mkDeps = (messages: HistoryEntry[]) => ({
  client: { session: { messages: async () => messages } },
});

const runRecall = async (messages: HistoryEntry[], args: string) => {
  const hook = createRecallCommandHook(mkDeps(messages));
  const output: { parts: unknown[] } = { parts: [] };
  await hook(
    { command: RECALL_COMMAND, sessionID: "s1", arguments: args },
    output,
  );
  return output;
};

describe("/recall command hook", () => {
  it("rewrites parts to a single text part with the recall output", async () => {
    const output = await runRecall(
      [
        userEntry("u0", "fix the alpha bug"),
        userEntry("u1", "alpha is tricky"),
      ],
      "alpha",
    );
    expect(output.parts).toHaveLength(1);
    const part = output.parts[0] as { type: string; text: string };
    expect(part.type).toBe("text");
    expect(part.text).toContain("alpha");
    expect(part.text).toContain("matches");
  });

  it("browse mode (no query) returns recent entries", async () => {
    const output = await runRecall([userEntry("u0", "hello there")], "");
    const part = output.parts[0] as { text: string };
    expect(part.text).toContain("Session history");
    expect(part.text).toContain("hello there");
  });

  it("page:N is parsed for pagination", async () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 7; i++)
      history.push(userEntry(`u${i}`, `alpha row ${i}`));
    const output = await runRecall(history, "alpha page:2");
    const part = output.parts[0] as { text: string };
    expect(part.text).toContain("Page 2/2");
  });

  it("ignores commands other than recall", async () => {
    const hook = createRecallCommandHook(mkDeps([userEntry("u0", "hi")]));
    const output: { parts: unknown[] } = {
      parts: [{ type: "text", text: "x" }],
    };
    await hook({ command: "other", sessionID: "s1", arguments: "hi" }, output);
    expect(output.parts).toEqual([{ type: "text", text: "x" }]);
  });

  it("buildRecallCommandOutput: no-match message", () => {
    const text = buildRecallCommandOutput(
      [userEntry("u0", "hello")],
      "zzznope",
    );
    expect(text).toContain("No matches");
  });

  it("config entry has a description", () => {
    expect(recallCommandConfig.description).toContain("Search");
  });
});
