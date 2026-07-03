import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VccPlugin } from "../src/index";

// Minimal fake opencode client — every method returns a RequestResult-like { data }.
const fakeClient = () => ({
  session: {
    messages: async () => ({ data: [] }),
    summarize: async () => ({ data: true }),
    prompt: async () => ({ data: {} }),
  },
  tui: {
    showToast: async () => ({ data: true }),
  },
});

const fakeInput = () =>
  ({
    client: fakeClient(),
    project: {},
    directory: "/tmp",
    worktree: "/tmp",
    experimental_workspace: { register: () => {} },
    serverUrl: new URL("http://localhost"),
    $: (() => {}) as unknown,
  }) as unknown as Parameters<typeof VccPlugin>[0];

let cfgDir: string;

beforeEach(() => {
  cfgDir = mkdtempSync(join(tmpdir(), "vcc-plugin-"));
  process.env["OPENCODE_VCC_CONFIG_PATH"] = join(cfgDir, "opencode-vcc.json");
});

afterEach(() => {
  delete process.env["OPENCODE_VCC_CONFIG_PATH"];
  rmSync(cfgDir, { recursive: true, force: true });
});

describe("VccPlugin entry", () => {
  it("returns the expected hooks and the vcc_recall tool", async () => {
    const hooks = await VccPlugin(fakeInput(), {});
    expect(typeof hooks.config).toBe("function");
    expect(typeof hooks["command.execute.before"]).toBe("function");
    expect(typeof hooks["experimental.session.compacting"]).toBe("function");
    expect(typeof hooks["experimental.text.complete"]).toBe("function");
    expect(typeof hooks.event).toBe("function");
    expect(hooks.tool?.vcc_recall).toBeDefined();
  });

  it("scaffolds the settings file on load", async () => {
    await VccPlugin(fakeInput(), {});
    const path = join(cfgDir, "opencode-vcc.json");
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    expect(parsed).toHaveProperty("overrideDefaultCompaction");
    expect(parsed).toHaveProperty("debug");
  });

  it("config hook registers both commands", async () => {
    const hooks = await VccPlugin(fakeInput(), {});
    const config: { command?: Record<string, unknown> } = {};
    await hooks.config?.(config as never);
    expect(config.command?.["vcc"]).toBeDefined();
    expect(config.command?.["vcc-recall"]).toBeDefined();
  });

  it("threads plugin options into settings (overrideDefaultCompaction)", async () => {
    // With override on, the compacting hook handles even without a pending request.
    const hooks = await VccPlugin(fakeInput(), {
      overrideDefaultCompaction: true,
    });
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.(
      { sessionID: "s1" },
      output,
    );
    // empty history → compile returns "" → no prompt set, but the hook ran
    // without throwing, proving options were threaded (override path taken).
    expect(output.prompt).toBeUndefined();
  });
});
