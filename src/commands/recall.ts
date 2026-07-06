import type { HistoryEntry } from "../core/render-entries";
import { loadAllMessages } from "../core/load-messages";
import { searchEntries } from "../core/search-entries";
import { formatRecallOutput } from "../core/format-recall";

export interface RecallCommandDeps {
  client: {
    session: {
      messages: (args: { path: { id: string } }) => Promise<HistoryEntry[]>;
    };
  };
}

export const RECALL_COMMAND = "recall";

const PAGE_SIZE = 5;
const DEFAULT_RECENT = 25;
const PAGE_RE = /\bpage:(\d+)\b/i;

/** Config entry registering the /recall slash command. */
export const recallCommandConfig = {
  template: " ",
  description: "Search session history. Usage: /recall <query> [page:N]",
};

/**
 * Build the recall output text for a /recall invocation. Extracted so it
 * is unit-testable without the hook plumbing.
 */
export const buildRecallCommandOutput = (
  history: HistoryEntry[],
  args: string,
): string => {
  const pageMatch = args.match(PAGE_RE);
  const page = pageMatch ? Math.max(1, Number(pageMatch[1])) : 1;
  const query = args.replace(PAGE_RE, "").replace(/\s+/g, " ").trim();

  if (!query) {
    const { rendered } = loadAllMessages(history, false);
    const recent = rendered.slice(-DEFAULT_RECENT);
    return formatRecallOutput(recent);
  }

  const { rendered, rawMessages } = loadAllMessages(history, false);
  const all = searchEntries(rendered, rawMessages, query);
  const start = (page - 1) * PAGE_SIZE;
  const pageResults = all.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(all.length / PAGE_SIZE);
  const header =
    totalPages > 1
      ? `Page ${page}/${totalPages} (${all.length} total matches)`
      : `${all.length} matches`;
  const footer =
    page < totalPages ? `\n--- /recall ${query} page:${page + 1} ---` : "";
  return formatRecallOutput(pageResults, query, header) + footer;
};

/**
 * command.execute.before handler for /recall: run the search and rewrite
 * the command's parts to a text part, so the result is fed to the agent as a
 * fresh turn (mirrors the upstream triggerTurn behavior).
 */
export const createRecallCommandHook =
  (deps: RecallCommandDeps) =>
  async (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: unknown[] },
  ): Promise<void> => {
    if (input.command !== RECALL_COMMAND) return;

    const history = await deps.client.session.messages({
      path: { id: input.sessionID },
    });
    const text = buildRecallCommandOutput(history, input.arguments);
    output.parts = [{ type: "text", text }];
  };
