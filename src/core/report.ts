export interface CompactionStats {
  /** Source message count fed to `compile`. */
  summarized: number;
  /** Whether a non-empty previous summary was merged into the result. */
  previousSummaryUsed: boolean;
  /** Requested tail user-turns to keep (advisory in opencode; null when unset). */
  keepN: number | null;
  /** Whether the user explicitly requested a keep count. */
  requestedKeepExplicit: boolean;
}

/**
 * Format the one-line compaction summary shown in the toast.
 *
 * The `keep:N` note is advisory only: opencode owns the tail cut, so unlike
 * pi-vcc we do not report how many turns were actually kept. `previousSummaryUsed`
 * intentionally does NOT alter the formatted string.
 */
export const formatCompactionStats = (stats: CompactionStats): string => {
  const keepNote =
    stats.keepN !== null && stats.requestedKeepExplicit
      ? `; keep:${stats.keepN} requested`
      : "";
  return `opencode-vcc: ${stats.summarized} source entries processed${keepNote}.`;
};
