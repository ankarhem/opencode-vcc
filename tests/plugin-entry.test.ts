import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VccPlugin } from "../src/index";

// Minimal fake opencode client — every method returns a RequestResult-like { data }.
const fakeClient = () => ({
  session: {
    messages: async () => ({ data: [] }),
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
  it("returns the expected hooks and the recall tool", async () => {
    const hooks = await VccPlugin(fakeInput(), {});
    expect(typeof hooks.config).toBe("function");
    expect(typeof hooks["command.execute.before"]).toBe("function");
    expect(typeof hooks["experimental.session.compacting"]).toBe("function");
    expect(typeof hooks["experimental.text.complete"]).toBe("function");
    expect(typeof hooks.event).toBe("function");
    expect(hooks.tool?.recall).toBeDefined();
  });

  it("scaffolds the settings file on load", async () => {
    await VccPlugin(fakeInput(), {});
    const path = join(cfgDir, "opencode-vcc.json");
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    expect(parsed).toHaveProperty("debug");
  });

  it("config hook registers the recall command", async () => {
    const hooks = await VccPlugin(fakeInput(), {});
    const config: { command?: Record<string, unknown> } = {};
    await hooks.config?.(config as never);
    expect(config.command?.["recall"]).toBeDefined();
  });
});
