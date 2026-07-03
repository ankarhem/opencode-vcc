import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface VccSettings {
  /**
   * When true, opencode-vcc handles ALL compactions. When false (default),
   * it only handles its explicit command and defers to opencode core.
   */
  overrideDefaultCompaction: boolean;
  /** Write debug snapshots on each compaction. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: VccSettings = {
  overrideDefaultCompaction: false,
  debug: false,
};

const SETTINGS_KEYS = ["overrideDefaultCompaction", "debug"] as const;
type SettingKey = (typeof SETTINGS_KEYS)[number];

const ENV_PATH = "OPENCODE_VCC_CONFIG_PATH";
const ENV_OVERRIDE = "OPENCODE_VCC_OVERRIDE_DEFAULT_COMPACTION";
const ENV_DEBUG = "OPENCODE_VCC_DEBUG";

/** Resolve the sidecar config path: env override, else the opencode config default. */
export function settingsPath(): string {
  return process.env[ENV_PATH] ?? join(homedir(), ".config", "opencode", "opencode-vcc.json");
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse an env flag: "true"/"1" → true, "false"/"0" → false, anything else → undefined. */
function parseEnvBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return undefined;
}

/**
 * Apply the full precedence chain:
 *   env > plugin options > sidecar JSON file > defaults
 * Never throws.
 */
export function loadSettings(options?: Record<string, unknown>): VccSettings {
  const result: VccSettings = { ...DEFAULT_SETTINGS };

  // Layer 1: sidecar file over defaults.
  const parsed = readJson(settingsPath());
  if (parsed) {
    for (const key of SETTINGS_KEYS) {
      const value = parsed[key];
      if (typeof value === "boolean") result[key] = value;
    }
  }

  // Layer 2: plugin options (present boolean keys) over sidecar.
  if (options) {
    for (const key of SETTINGS_KEYS) {
      const value = options[key];
      if (typeof value === "boolean") result[key] = value;
    }
  }

  // Layer 3: env over everything.
  const envMap: Record<SettingKey, string | undefined> = {
    overrideDefaultCompaction: process.env[ENV_OVERRIDE],
    debug: process.env[ENV_DEBUG],
  };
  for (const key of SETTINGS_KEYS) {
    const value = parseEnvBool(envMap[key]);
    if (value !== undefined) result[key] = value;
  }

  return result;
}

/**
 * Ensure the sidecar config exists with default keys.
 * - File missing → create dir (recursive) + write DEFAULT_SETTINGS.
 * - File exists, invalid JSON → no-op (never clobber).
 * - File exists, valid → fill missing default keys, preserve existing values.
 * Never throws — all FS wrapped in try/catch.
 */
export function scaffoldSettings(): void {
  try {
    const path = settingsPath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (!existsSync(path)) {
      writeFileSync(path, `${JSON.stringify(DEFAULT_SETTINGS, null, 2)}\n`);
      return;
    }

    const parsed = readJson(path);
    if (!parsed) return; // don't clobber invalid JSON

    let changed = false;
    const next: Record<string, unknown> = { ...parsed };
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in next)) {
        next[key] = value;
        changed = true;
      }
    }
    if (changed) writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  } catch {
    // best-effort; never crash plugin load
  }
}
