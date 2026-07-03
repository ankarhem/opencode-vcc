import type { HistoryEntry } from "../core/render-entries";
import { loadAllMessages } from "../core/load-messages";
import { searchEntries } from "../core/search-entries";
import { formatRecallOutput } from "../core/format-recall";
import { parseRecallScope } from "../core/recall-scope";

export interface VccRecallCommandDeps {
  client: {
    session: {
      messages: (args: { path: { id: string } }) => Promise<HistoryEntry[]>;
    };
  };
}

export const VCC_RECALL_COMMAND = "pi-vcc-recall";

const PAGE_SIZE = 5;
const DEFAULT_RECENT = 25;
const PAGE_RE = /\bpage:(\d+)\b/i;

/** Config entry registering the /pi-vcc-recall slash command. */
export const vccRecallCommandConfig = {
  template: " ",
  description:
    "Search session history. Usage: /pi-vcc-recall <query> [page:N] [scope:all]",
};

/**
 * Build the recall output text for a /pi-vcc-recall invocation. Extracted so it
 * is unit-testable without the hook plumbing.
 */
export const buildRecallCommandOutput = (
  history: HistoryEntry[],
  args: string,
): string => {
  const { scope, text: afterScope } = parseRecallScope(args);
  const pageMatch = afterScope.match(PAGE_RE);
  const page = pageMatch ? Math.max(1, Number(pageMatch[1])) : 1;
  const query = afterScope.replace(PAGE_RE, "").replace(/\s+/g, " ").trim();
  const scopePrefix = scope === "all" ? "Scope: all\n\n" : "";
  const scopeNote = scope === "all" ? " (scope: all)" : "";

  if (!query) {
    const { rendered } = loadAllMessages(history, false);
    const recent = rendered.slice(-DEFAULT_RECENT);
    return scopePrefix + formatRecallOutput(recent);
  }

  const { rendered, rawMessages } = loadAllMessages(history, false);
  const all = searchEntries(rendered, rawMessages, query);
  const start = (page - 1) * PAGE_SIZE;
  const pageResults = all.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(all.length / PAGE_SIZE);
  const header =
    totalPages > 1
      ? `Page ${page}/${totalPages} (${all.length} total matches${scopeNote})`
      : `${all.length} matches${scopeNote}`;
  const footer =
    page < totalPages
      ? `\n--- /pi-vcc-recall ${query}${scope === "all" ? " scope:all" : ""} page:${page + 1} ---`
      : "";
  return formatRecallOutput(pageResults, query, header) + footer;
};

/**
 * command.execute.before handler for /pi-vcc-recall: run the search and rewrite
 * the command's parts to a text part, so the result is fed to the agent as a
 * fresh turn (mirrors pi-vcc's triggerTurn behavior).
 */
export const createVccRecallCommandHook =
  (deps: VccRecallCommandDeps) =>
  async (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: unknown[] },
  ): Promise<void> => {
    if (input.command !== VCC_RECALL_COMMAND) return;

    const history = await deps.client.session.messages({
      path: { id: input.sessionID },
    });
    const text = buildRecallCommandOutput(history, input.arguments);
    output.parts = [{ type: "text", text }];
  };
