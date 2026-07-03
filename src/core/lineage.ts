import type { RecallScope } from "./recall-scope";

/** Default scope for `vcc_recall` / `/pi-vcc-recall` when none is specified. */
export const DEFAULT_RECALL_SCOPE: RecallScope = "lineage";

export interface SessionLike {
  id: string;
  parentID?: string;
}

/**
 * Resolve the set of session ids that make up the "active lineage" — the
 * current (leaf) session plus its ancestor chain via `parentID`.
 *
 * - If no session has a `parentID`, there's no lineage info to walk; fall
 *   back to treating every session as in-scope.
 * - Otherwise, the "active" session is the leaf: the one whose id is not
 *   referenced as anyone else's `parentID`. Walk up from the leaf via
 *   `parentID` to collect the full chain (leaf + all ancestors).
 */
export const getLineageEntryIds = (sessions: SessionLike[]): Set<string> => {
  if (sessions.length === 0) return new Set();

  const hasAnyParent = sessions.some((s) => Boolean(s.parentID));
  if (!hasAnyParent) {
    return new Set(sessions.map((s) => s.id));
  }

  const parentIds = new Set(sessions.map((s) => s.parentID).filter((p): p is string => Boolean(p)));
  const leaf = sessions.find((s) => !parentIds.has(s.id)) ?? sessions[sessions.length - 1];

  const byId = new Map(sessions.map((s) => [s.id, s] as const));
  const chain = new Set<string>();
  let current: SessionLike | undefined = leaf;
  while (current) {
    chain.add(current.id);
    current = current.parentID ? byId.get(current.parentID) : undefined;
  }
  return chain;
};
