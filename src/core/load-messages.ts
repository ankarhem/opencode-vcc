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
 */
export const loadAllMessages = (
  history: HistoryEntry[],
  full = false,
): LoadedMessages => {
  const rendered: RenderedEntry[] = [];
  const rawMessages: HistoryEntry[] = [];

  let messageIndex = 0;
  for (const entry of history) {
    rendered.push(renderMessage(entry, messageIndex, full));
    rawMessages.push(entry);
    messageIndex++;
  }

  return { rendered, rawMessages };
};
