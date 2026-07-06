import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_SETTINGS,
  loadSettings,
  scaffoldSettings,
  settingsPath,
} from "../src/core/settings.ts";

const ENV_PATH = "OPENCODE_VCC_CONFIG_PATH";
const ENV_DEBUG = "OPENCODE_VCC_DEBUG";

let workDir: string;
let cfgPath: string;

function clearVccEnv(): void {
  delete process.env[ENV_PATH];
  delete process.env[ENV_DEBUG];
}

beforeEach(() => {
  clearVccEnv();
  workDir = join(
    tmpdir(),
    `opencode-vcc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(workDir, { recursive: true });
  cfgPath = join(workDir, "opencode-vcc.json");
  process.env[ENV_PATH] = cfgPath;
});

afterEach(() => {
  clearVccEnv();
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

describe("settingsPath", () => {
  test("uses OPENCODE_VCC_CONFIG_PATH override when set", () => {
    expect(settingsPath()).toBe(cfgPath);
  });

  test("falls back to ~/.config/opencode/opencode-vcc.json default", () => {
    delete process.env[ENV_PATH];
    const p = settingsPath();
    expect(p.endsWith(join(".config", "opencode", "opencode-vcc.json"))).toBe(
      true,
    );
  });
});

describe("loadSettings precedence", () => {
  test("returns defaults when no file, no options, no env", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings()).not.toBe(DEFAULT_SETTINGS); // fresh object
  });

  test("sidecar file values override defaults", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: true }));
    expect(loadSettings()).toEqual({ debug: true });
  });

  test("ignores invalid JSON file, returns defaults", () => {
    writeFileSync(cfgPath, "{ not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test("plugin options (present keys) override sidecar", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: false }));
    expect(loadSettings({ debug: true })).toEqual({ debug: true });
  });

  test("absent option keys fall through to sidecar", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: true }));
    expect(loadSettings({})).toEqual({ debug: true });
  });

  test("non-boolean option values are ignored", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: true }));
    expect(loadSettings({ debug: "yes" as unknown as boolean }).debug).toBe(
      true,
    );
  });

  test("env OPENCODE_VCC_DEBUG='1' overrides options AND sidecar", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: false }));
    process.env[ENV_DEBUG] = "1";
    expect(loadSettings({ debug: false }).debug).toBe(true);
  });

  test("env with garbage value is ignored", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: true }));
    process.env[ENV_DEBUG] = "maybe";
    expect(loadSettings().debug).toBe(true);
  });

  test("full chain: env > options > sidecar > defaults", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: false }));
    process.env[ENV_DEBUG] = "true";
    expect(loadSettings({ debug: false })).toEqual({ debug: true });
  });
});

describe("scaffoldSettings", () => {
  test("creates file with defaults when missing", () => {
    expect(existsSync(cfgPath)).toBe(false);
    scaffoldSettings();
    expect(existsSync(cfgPath)).toBe(true);
    const written = JSON.parse(readFileSync(cfgPath, "utf-8"));
    expect(written).toEqual(DEFAULT_SETTINGS);
    // trailing newline + 2-space indent
    expect(readFileSync(cfgPath, "utf-8").endsWith("\n")).toBe(true);
  });

  test("OPENCODE_VCC_CONFIG_PATH redirects scaffold to custom path", () => {
    const custom = join(workDir, "nested", "custom.json");
    process.env[ENV_PATH] = custom;
    scaffoldSettings();
    expect(existsSync(custom)).toBe(true);
    expect(JSON.parse(readFileSync(custom, "utf-8"))).toEqual(DEFAULT_SETTINGS);
  });

  test("merges missing keys non-destructively, preserving existing", () => {
    writeFileSync(cfgPath, JSON.stringify({ debug: true }));
    scaffoldSettings();
    const merged = JSON.parse(readFileSync(cfgPath, "utf-8"));
    expect(merged.debug).toBe(true); // preserved
  });

  test("leaves valid file with all keys untouched (no rewrite churn)", () => {
    const original = `${JSON.stringify({ debug: true }, null, 2)}\n`;
    writeFileSync(cfgPath, original);
    scaffoldSettings();
    expect(readFileSync(cfgPath, "utf-8")).toBe(original);
  });

  test("leaves invalid JSON file UNTOUCHED (does not clobber)", () => {
    const garbage = "{ this is not json ]";
    writeFileSync(cfgPath, garbage);
    scaffoldSettings();
    expect(readFileSync(cfgPath, "utf-8")).toBe(garbage);
  });

  test("NEVER throws on unwritable/impossible path", () => {
    // Point at a path whose parent is a file, so mkdir/write fails internally.
    const fileAsParent = join(workDir, "afile");
    writeFileSync(fileAsParent, "x");
    process.env[ENV_PATH] = join(fileAsParent, "sub", "cfg.json");
    expect(() => scaffoldSettings()).not.toThrow();
  });
});
