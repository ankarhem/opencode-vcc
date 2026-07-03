import { describe, it, expect } from "bun:test";
import { extractFiles } from "../src/extract/files";
import { normalize } from "../src/core/normalize";
import { assistantToolCallEntry, history } from "./fixtures";

describe("extractFiles", () => {
  it("adds Read tool paths to the read set", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Read", { path: "/x/read.ts" })),
    );
    const act = extractFiles(blocks);
    expect(act.read.has("/x/read.ts")).toBe(true);
    expect(act.modified.has("/x/read.ts")).toBe(false);
    expect(act.created.has("/x/read.ts")).toBe(false);
  });

  it("adds Edit tool paths to the modified set only", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Edit", { path: "/y/edit.ts" })),
    );
    const act = extractFiles(blocks);
    expect(act.modified.has("/y/edit.ts")).toBe(true);
    expect(act.read.has("/y/edit.ts")).toBe(false);
    expect(act.created.has("/y/edit.ts")).toBe(false);
  });

  it("adds Write tool paths to both modified and created sets", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Write", { path: "/z/write.ts" })),
    );
    const act = extractFiles(blocks);
    // The same absolute path appears twice in the combined array (once via
    // `modified`, once via `created`), so it "self-trims" against its own
    // directory — verbatim pi-vcc behavior for this edge case.
    expect(act.modified.has("write.ts")).toBe(true);
    expect(act.created.has("write.ts")).toBe(true);
    expect(act.read.has("write.ts")).toBe(false);
  });

  it("recognizes lowercase tool name variants", () => {
    const blocks = normalize(
      history(
        assistantToolCallEntry("read_file", { path: "/a/r.ts" }),
        assistantToolCallEntry("write_file", { path: "/a/w.ts" }),
        assistantToolCallEntry("edit", { path: "/a/e.ts" }),
      ),
    );
    const act = extractFiles(blocks);
    // All paths share the "/a/" directory, so the common prefix is trimmed.
    expect(act.read.has("r.ts")).toBe(true);
    expect(act.modified.has("w.ts")).toBe(true);
    expect(act.created.has("w.ts")).toBe(true);
    expect(act.modified.has("e.ts")).toBe(true);
  });

  it("ignores tool_calls without a recognizable path", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Read", { foo: "bar" })),
    );
    const act = extractFiles(blocks);
    expect(act.read.size).toBe(0);
  });

  it("ignores non-file tools entirely", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Glob", { path: "/x/y.ts" })),
    );
    const act = extractFiles(blocks);
    expect(act.read.size).toBe(0);
    expect(act.modified.size).toBe(0);
    expect(act.created.size).toBe(0);
  });

  it("trims the longest common directory prefix when >=2 absolute paths share it", () => {
    const blocks = normalize(
      history(
        assistantToolCallEntry("Read", { path: "/repo/src/a.ts" }),
        assistantToolCallEntry("Edit", { path: "/repo/src/b.ts" }),
      ),
    );
    const act = extractFiles(blocks);
    expect(act.read.has("a.ts")).toBe(true);
    expect(act.modified.has("b.ts")).toBe(true);
    expect(act.read.has("/repo/src/a.ts")).toBe(false);
    expect(act.modified.has("/repo/src/b.ts")).toBe(false);
  });

  it("does not trim when only a single absolute path is present", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Read", { path: "/repo/src/only.ts" })),
    );
    const act = extractFiles(blocks);
    expect(act.read.has("/repo/src/only.ts")).toBe(true);
  });

  it("seeds sets from fileOps and merges with blocks", () => {
    const blocks = normalize(
      history(assistantToolCallEntry("Read", { path: "/bbb/new.ts" })),
    );
    const act = extractFiles(blocks, {
      readFiles: ["/aaa/seed.ts"],
      modifiedFiles: ["/ccc/mod.ts"],
      createdFiles: ["/ddd/created.ts"],
    });
    expect(act.read.has("/aaa/seed.ts")).toBe(true);
    expect(act.read.has("/bbb/new.ts")).toBe(true);
    expect(act.modified.has("/ccc/mod.ts")).toBe(true);
    expect(act.created.has("/ddd/created.ts")).toBe(true);
  });

  it("returns empty sets when given no blocks and no fileOps", () => {
    const act = extractFiles([]);
    expect(act.read.size).toBe(0);
    expect(act.modified.size).toBe(0);
    expect(act.created.size).toBe(0);
  });
});
