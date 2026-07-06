import { describe, it, expect } from "bun:test";
import { extractCommits, formatCommits } from "../src/extract/commits";
import { normalize } from "../src/core/normalize";
import { bashEntry, history } from "./fixtures";

describe("extractCommits", () => {
  it("extracts the commit message from a git commit bash block", () => {
    const blocks = normalize(history(bashEntry('git commit -m "Fix bug"', "")));
    const commits = extractCommits(blocks);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.message).toBe("Fix bug");
    expect(commits[0]?.hash).toBeUndefined();
  });

  it("extracts the hash from bracketed git commit output", () => {
    const blocks = normalize(
      history(
        bashEntry(
          'git commit -m "Add feature"',
          "[main a1b2c3d] Add feature\n 1 file changed, 2 insertions(+)",
        ),
      ),
    );
    const commits = extractCommits(blocks);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.hash).toBe("a1b2c3d");
    expect(commits[0]?.message).toBe("Add feature");
  });

  it("extracts the second hash from a hash range", () => {
    const blocks = normalize(
      history(
        bashEntry('git commit -m "Update range"', "Updating a1b2c3d..b3c4d5e"),
      ),
    );
    const commits = extractCommits(blocks);
    expect(commits[0]?.hash).toBe("b3c4d5e");
  });

  it("extracts a plain bare hash when no bracket/range pattern matches", () => {
    const blocks = normalize(
      history(
        bashEntry('git commit -m "Plain hash"', "Committed as a1b2c3d4e5f"),
      ),
    );
    const commits = extractCommits(blocks);
    expect(commits[0]?.hash).toBe("a1b2c3d4e5f");
  });

  it("dedups identical hash+message commits", () => {
    const blocks = normalize(
      history(
        bashEntry('git commit -m "Dup"', "[main a1b2c3d] Dup"),
        bashEntry('git commit -m "Dup"', "[main a1b2c3d] Dup"),
      ),
    );
    const commits = extractCommits(blocks);
    expect(commits).toHaveLength(1);
  });

  it("unescapes escaped quotes in the commit message", () => {
    const blocks = normalize(
      history(bashEntry('git commit -m "He said \\"hi\\""', "")),
    );
    const commits = extractCommits(blocks);
    expect(commits[0]?.message).toBe('He said "hi"');
  });

  it("ignores bash blocks that are not git commit commands", () => {
    const blocks = normalize(history(bashEntry("git status", "")));
    const commits = extractCommits(blocks);
    expect(commits).toHaveLength(0);
  });

  it("ignores non-bash blocks", () => {
    const blocks = normalize(history());
    const commits = extractCommits(blocks);
    expect(commits).toHaveLength(0);
  });

  it("ignores git commit commands without -m flag", () => {
    const blocks = normalize(
      history(bashEntry("git commit --allow-empty", "")),
    );
    const commits = extractCommits(blocks);
    expect(commits).toHaveLength(0);
  });
});

describe("formatCommits", () => {
  it("formats a commit with a hash prefix", () => {
    const lines = formatCommits([{ hash: "a1b2c3d", message: "Fix bug" }]);
    expect(lines).toEqual(["a1b2c3d: Fix bug"]);
  });

  it("formats a commit without a hash", () => {
    const lines = formatCommits([{ message: "Fix bug" }]);
    expect(lines).toEqual(["Fix bug"]);
  });

  it("keeps only the most recent `limit` commits", () => {
    const commits = Array.from({ length: 10 }, (_, i) => ({
      message: `commit ${i}`,
    }));
    const lines = formatCommits(commits);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe("commit 2");
    expect(lines[7]).toBe("commit 9");
  });
});
