import { describe, it, expect } from "bun:test";
import {
  formatCompactionStats,
  type CompactionStats,
} from "../src/core/report";

const stats = (over: Partial<CompactionStats> = {}): CompactionStats => ({
  summarized: 0,
  previousSummaryUsed: false,
  keepN: null,
  requestedKeepExplicit: false,
  ...over,
});

describe("formatCompactionStats", () => {
  it("formats the basic case (no keep)", () => {
    expect(formatCompactionStats(stats({ summarized: 5 }))).toBe(
      "opencode-vcc: 5 source entries processed.",
    );
  });

  it("appends a keep note when keepN is set and explicit", () => {
    expect(
      formatCompactionStats(
        stats({ summarized: 10, keepN: 3, requestedKeepExplicit: true }),
      ),
    ).toBe("opencode-vcc: 10 source entries processed; keep:3 requested.");
  });

  it("omits the keep note when keepN is null", () => {
    const msg = formatCompactionStats(
      stats({ summarized: 7, keepN: null, requestedKeepExplicit: false }),
    );
    expect(msg).toBe("opencode-vcc: 7 source entries processed.");
    expect(msg).not.toContain("keep:");
  });

  it("omits the keep note when keepN is set but not explicit", () => {
    const msg = formatCompactionStats(
      stats({ summarized: 4, keepN: 2, requestedKeepExplicit: false }),
    );
    expect(msg).toBe("opencode-vcc: 4 source entries processed.");
    expect(msg).not.toContain("keep:");
  });

  it("includes keep:0 note when explicitly requested", () => {
    expect(
      formatCompactionStats(
        stats({ summarized: 9, keepN: 0, requestedKeepExplicit: true }),
      ),
    ).toBe("opencode-vcc: 9 source entries processed; keep:0 requested.");
  });

  it("does not change format based on previousSummaryUsed", () => {
    const withPrev = formatCompactionStats(
      stats({ summarized: 6, previousSummaryUsed: true }),
    );
    const withoutPrev = formatCompactionStats(
      stats({ summarized: 6, previousSummaryUsed: false }),
    );
    expect(withPrev).toBe(withoutPrev);
    expect(withPrev).toBe("opencode-vcc: 6 source entries processed.");
  });
});
