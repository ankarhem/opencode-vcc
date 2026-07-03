import { describe, it, expect } from "bun:test";
import {
  createPiVccCommandHook,
  piVccCommandConfig,
  PI_VCC_COMMAND,
} from "../src/commands/pi-vcc";
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
  const hook = createPiVccCommandHook(deps, setPending);
  return { recorded, hook };
};

const runPiVcc = async (
  hook: ReturnType<typeof mkHarness>["hook"],
  args: string,
) => {
  const output: { parts: unknown[] } = {
    parts: [{ type: "text", text: "orig" }],
  };
  await hook(
    { command: PI_VCC_COMMAND, sessionID: "s1", arguments: args },
    output,
  );
  return output;
};

describe("/pi-vcc command hook", () => {
  it("bare invocation: keepN null, no follow-up, blanks parts, triggers summarize", async () => {
    const { recorded, hook } = mkHarness();
    const output = await runPiVcc(hook, "");
    expect(recorded.pending).toHaveLength(1);
    expect(recorded.pending[0]?.request.keepN).toBeNull();
    expect(recorded.pending[0]?.request.followUpPrompt).toBeUndefined();
    expect(recorded.summarized).toEqual([{ path: { id: "s1" } }]);
    expect(output.parts).toEqual([]);
  });

  it("keep:N prefix parsed into pending", async () => {
    const { recorded, hook } = mkHarness();
    await runPiVcc(hook, "keep:3");
    expect(recorded.pending[0]?.request.keepN).toBe(3);
  });

  it("keep:N prefix + follow-up prompt", async () => {
    const { recorded, hook } = mkHarness();
    await runPiVcc(hook, "keep:2 continue the refactor");
    expect(recorded.pending[0]?.request.keepN).toBe(2);
    expect(recorded.pending[0]?.request.followUpPrompt).toBe(
      "continue the refactor",
    );
  });

  it("trailing keep:N token", async () => {
    const { recorded, hook } = mkHarness();
    await runPiVcc(hook, "do the thing keep:1");
    expect(recorded.pending[0]?.request.keepN).toBe(1);
    expect(recorded.pending[0]?.request.followUpPrompt).toBe("do the thing");
  });

  it("ignores commands other than pi-vcc", async () => {
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
    expect(piVccCommandConfig.description).toContain("Compact");
  });
});
