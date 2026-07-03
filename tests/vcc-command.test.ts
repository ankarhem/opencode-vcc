import { describe, it, expect } from "bun:test";
import {
  createVccCommandHook,
  vccCommandConfig,
  VCC_COMMAND,
} from "../src/commands/vcc";
import type { PendingRequest } from "../src/hooks/compaction";

interface Recorded {
  pending: Array<{ sessionID: string; request: PendingRequest }>;
  summarized: Array<{ path: { id: string } }>;
}

const mkHarness = () => {
  const recorded: Recorded = { pending: [], summarized: [] };
  const setPending = (sessionID: string, request: PendingRequest) => {
    recorded.pending.push({ sessionID, request });
  };
  const deps = {
    client: {
      session: {
        summarize: async (args: { path: { id: string } }) => {
          recorded.summarized.push(args);
          return undefined;
        },
      },
    },
  };
  const hook = createVccCommandHook(deps, setPending);
  return { recorded, hook };
};

const runVcc = async (
  hook: ReturnType<typeof mkHarness>["hook"],
  args: string,
) => {
  const output: { parts: unknown[] } = {
    parts: [{ type: "text", text: "orig" }],
  };
  await hook(
    { command: VCC_COMMAND, sessionID: "s1", arguments: args },
    output,
  );
  return output;
};

describe("/vcc command hook", () => {
  it("bare invocation: keepN null, no follow-up, blanks parts, triggers summarize", async () => {
    const { recorded, hook } = mkHarness();
    const output = await runVcc(hook, "");
    expect(recorded.pending).toHaveLength(1);
    expect(recorded.pending[0]?.request.keepN).toBeNull();
    expect(recorded.pending[0]?.request.followUpPrompt).toBeUndefined();
    expect(recorded.summarized).toEqual([{ path: { id: "s1" } }]);
    expect(output.parts).toEqual([]);
  });

  it("keep:N prefix parsed into pending", async () => {
    const { recorded, hook } = mkHarness();
    await runVcc(hook, "keep:3");
    expect(recorded.pending[0]?.request.keepN).toBe(3);
  });

  it("keep:N prefix + follow-up prompt", async () => {
    const { recorded, hook } = mkHarness();
    await runVcc(hook, "keep:2 continue the refactor");
    expect(recorded.pending[0]?.request.keepN).toBe(2);
    expect(recorded.pending[0]?.request.followUpPrompt).toBe(
      "continue the refactor",
    );
  });

  it("trailing keep:N token", async () => {
    const { recorded, hook } = mkHarness();
    await runVcc(hook, "do the thing keep:1");
    expect(recorded.pending[0]?.request.keepN).toBe(1);
    expect(recorded.pending[0]?.request.followUpPrompt).toBe("do the thing");
  });

  it("ignores commands other than vcc", async () => {
    const { recorded, hook } = mkHarness();
    const output: { parts: unknown[] } = {
      parts: [{ type: "text", text: "orig" }],
    };
    await hook(
      { command: "something-else", sessionID: "s1", arguments: "" },
      output,
    );
    expect(recorded.pending).toHaveLength(0);
    expect(recorded.summarized).toHaveLength(0);
    expect(output.parts).toEqual([{ type: "text", text: "orig" }]);
  });

  it("config entry has a description", () => {
    expect(vccCommandConfig.description).toContain("Compact");
  });
});
