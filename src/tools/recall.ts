import { tool, type ToolResult } from "@opencode-ai/plugin";
import type { HistoryEntry } from "../core/render-entries";
import { loadAllMessages } from "../core/load-messages";
import { searchEntries } from "../core/search-entries";
import { formatRecallOutput } from "../core/format-recall";

export interface RecallToolDeps {
  client: {
    session: {
      messages: (args: { path: { id: string } }) => Promise<HistoryEntry[]>;
    };
  };
}

const PAGE_SIZE = 5;
const DEFAULT_RECENT = 25;

/**
 * Indices requested for expansion that are invalid: non-integers, or not present
 * in the available index set. Ported from pi-vcc's expand validation.
 */
export const invalidExpandIndices = (
  requested: number[],
  available: Set<number>,
): number[] =>
  requested.filter((i) => !Number.isInteger(i) || !available.has(i));

export const createRecallTool = (deps: RecallToolDeps) =>
  tool({
    description:
      "Search session history for prior work, decisions, and context from before compaction. Supports regex queries, paging, and expand indices.",
    args: {
      query: tool.schema.string().optional(),
      expand: tool.schema.array(tool.schema.number()).optional(),
      page: tool.schema.number().optional(),
    },
    async execute(args, context): Promise<ToolResult> {
      const history = await deps.client.session.messages({
        path: { id: context.sessionID },
      });

      const query = args.query?.trim() ?? "";
      const expand = args.expand ?? [];

      // -- EXPAND mode: full untruncated content by index, no query --
      if (expand.length > 0 && !query) {
        const { rendered } = loadAllMessages(history, true);
        const available = new Set(rendered.map((e) => e.index));
        const invalid = invalidExpandIndices(expand, available);
        if (invalid.length > 0) {
          return {
            output: `Cannot expand indices outside session history: ${invalid.join(", ")}`,
          };
        }
        const wanted = new Set(expand);
        const expanded = rendered.filter((e) => wanted.has(e.index));
        return { output: formatRecallOutput(expanded) };
      }

      // -- SEARCH mode: paginated ranked results --
      if (query) {
        const { rendered, rawMessages } = loadAllMessages(history, false);
        const all = searchEntries(rendered, rawMessages, query);
        const page = Math.max(1, args.page ?? 1);
        const start = (page - 1) * PAGE_SIZE;
        const pageResults = all.slice(start, start + PAGE_SIZE);
        const totalPages = Math.ceil(all.length / PAGE_SIZE);
        const header =
          totalPages > 1
            ? `Page ${page}/${totalPages} (${all.length} total matches)`
            : `${all.length} matches`;
        const footer =
          page < totalPages
            ? `\n--- Use page:${page + 1} for more results ---`
            : "";
        return {
          output: formatRecallOutput(pageResults, query, header) + footer,
        };
      }

      // -- BROWSE mode: last N entries --
      const { rendered } = loadAllMessages(history, false);
      const recent = rendered.slice(-DEFAULT_RECENT);
      return { output: formatRecallOutput(recent) };
    },
  });
