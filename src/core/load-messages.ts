import {
  renderMessage,
  type RenderedEntry,
  type HistoryEntry,
} from "./render-entries";

export interface LoadedMessages {
  rendered: RenderedEntry[];
  rawMessages: HistoryEntry[];
}

/**
 * Render a slice of opencode session history (as returned by
 * `client.session.messages({ path: { id: sessionID } })`) into RenderedEntry[].
 *
 * Load-bearing invariant (ported from pi-vcc): the message index increments
 * for EVERY message in `history`, even ones filtered out by `allowedEntryIds`.
 * This keeps `expand:[N]` indices stable across scope switches (lineage vs all).
 */
export const loadAllMessages = (
  history: HistoryEntry[],
  full = false,
  allowedEntryIds?: Set<string>,
): LoadedMessages => {
  const rendered: RenderedEntry[] = [];
  const rawMessages: HistoryEntry[] = [];

  let messageIndex = 0;
  for (const entry of history) {
    const allowed = !allowedEntryIds || allowedEntryIds.has(entry.info.id);
    if (allowed) {
      rendered.push(renderMessage(entry, messageIndex, full));
      rawMessages.push(entry);
    }
    messageIndex++;
  }

  return { rendered, rawMessages };
};
