import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Smoke test: proves bun:test wiring + package.json shape are correct.
test("package.json declares an ESM opencode plugin", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
  expect(pkg.type).toBe("module");
  expect(pkg.peerDependencies["@opencode-ai/plugin"]).toBeTruthy();
});
