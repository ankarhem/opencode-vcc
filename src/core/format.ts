/**
 * Text appended to opencode's native compaction summaries so the agent knows
 * the `recall` tool exists and can recover pre-compaction context.
 *
 * Wording is intentionally imperative and specific: "Before starting new work"
 * gives a clear trigger condition, listing searchable categories (decisions,
 * completed tasks, file changes) tells the agent WHAT to look for, and the
 * trailing warning discourages redoing completed work.
 */
export const RECALL_NOTE =
  "IMPORTANT: Context before this summary was compacted and may be incomplete. " +
  "Use the `recall` tool to search in the pre-compaction context as needed. " +
  "Do not redo work already completed.";
