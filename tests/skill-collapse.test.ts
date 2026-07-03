import { describe, it, expect } from "bun:test";
import {
  collapseSkillLines,
  collapseSkillText,
} from "../src/core/skill-collapse";

describe("collapseSkillLines", () => {
  it("dedups by skill name and drops all content inside the block", () => {
    const lines = [
      '<skill name="git">',
      "some content",
      "more content",
      "</skill>",
      "regular line",
      '<skill name="git">',
      "dup content",
      "</skill>",
    ];
    expect(collapseSkillLines(lines)).toEqual(["[skill: git]", "regular line"]);
  });

  it("matches the leading-dash tag/close variant", () => {
    expect(
      collapseSkillLines(['-<skill name="x">', "content", "-</skill>"]),
    ).toEqual(["[skill: x]"]);
  });

  it("matches the leading-whitespace tag/close variant", () => {
    expect(
      collapseSkillLines(['  <skill name="y">', "data", "  </skill>"]),
    ).toEqual(["[skill: y]"]);
  });

  it("passes through lines with no skill tags", () => {
    expect(collapseSkillLines(["plain a", "plain b"])).toEqual([
      "plain a",
      "plain b",
    ]);
  });
});

describe("collapseSkillText", () => {
  it("replaces a closed skill block with a [skill: NAME] marker", () => {
    expect(
      collapseSkillText(
        'before <skill name="git" version="1">hidden</skill> after',
      ),
    ).toBe("before [skill: git] after");
  });

  it("replaces a multiline skill block", () => {
    expect(collapseSkillText('<skill name="a">\nline1\nline2\n</skill>')).toBe(
      "[skill: a]",
    );
  });

  it("consumes an unclosed skill tag to EOF", () => {
    expect(collapseSkillText('start <skill name="x">rest of text')).toBe(
      "start [skill: x]",
    );
  });
});
