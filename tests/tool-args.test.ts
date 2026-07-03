import { describe, it, expect } from "bun:test";
import { extractPath, summarizeToolArgs } from "../src/core/tool-args";

describe("extractPath", () => {
  it("reads the `path` key", () => {
    expect(extractPath({ path: "/a" })).toBe("/a");
  });

  it("reads the `file_path` key", () => {
    expect(extractPath({ file_path: "/b" })).toBe("/b");
  });

  it("reads the `filePath` key", () => {
    expect(extractPath({ filePath: "/c" })).toBe("/c");
  });

  it("reads the `file` key", () => {
    expect(extractPath({ file: "/d" })).toBe("/d");
  });

  it("respects priority: path beats file_path", () => {
    expect(extractPath({ path: "/a", file_path: "/b" })).toBe("/a");
  });

  it("returns null when no path-like key is present", () => {
    expect(extractPath({ foo: "bar" })).toBe(null);
  });

  it("skips non-string path values", () => {
    expect(extractPath({ path: 123 })).toBe(null);
  });

  it("returns null for an empty args object", () => {
    expect(extractPath({})).toBe(null);
  });
});

describe("summarizeToolArgs", () => {
  it("summarizes a path", () => {
    expect(summarizeToolArgs({ path: "/x" })).toBe("path=/x");
  });

  it("summarizes a command when no path", () => {
    expect(summarizeToolArgs({ command: "ls -la" })).toBe("command=ls -la");
  });

  it("summarizes a query when no path or command", () => {
    expect(summarizeToolArgs({ query: "hello" })).toBe("query=hello");
  });

  it("prefers path over command", () => {
    expect(summarizeToolArgs({ path: "/x", command: "ls" })).toBe("path=/x");
  });

  it("falls back to comma-joined keys", () => {
    expect(summarizeToolArgs({ foo: "bar", baz: "qux" })).toBe("foo, baz");
  });

  it("returns empty string for empty args", () => {
    expect(summarizeToolArgs({})).toBe("");
  });
});
