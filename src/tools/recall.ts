import { tool, type ToolResult } from "@opencode-ai/plugin";
import type { HistoryEntry } from "../core/render-entries";
import { loadAllMessages } from "../core/load-messages";
import { searchEntries } from "../core/search-entries";
import { formatRecallOutput } from "../core/format-recall";
import { normalizeRecallScope, type RecallScope } from "../core/recall-scope";

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
 * in the available (scoped) index set. Ported from pi-vcc's expand validation.
 */
export const invalidExpandIndices = (
  requested: number[],
  available: Set<number>,
): number[] =>
  requested.filter((i) => !Number.isInteger(i) || !available.has(i));

const scopePrefix = (scope: RecallScope): string =>
  scope === "all" ? "Scope: all\n\n" : "";

export const createVccRecallTool = (deps: RecallToolDeps) =>
  tool({
    description:
      "Search session history. Defaults to active lineage; use scope:'all' to include off-lineage branches. Supports regex queries, paging, and expand indices.",
    args: {
      query: tool.schema.string().optional(),
      expand: tool.schema.array(tool.schema.number()).optional(),
      page: tool.schema.number().optional(),
      scope: tool.schema
        .union([tool.schema.literal("lineage"), tool.schema.literal("all")])
        .optional(),
    },
    async execute(args, context): Promise<ToolResult> {
      const scope = normalizeRecallScope(args.scope);
      const history = await deps.client.session.messages({
        path: { id: context.sessionID },
      });

      const query = args.query?.trim() ?? "";
      const expand = args.expand ?? [];

      // ── EXPAND mode: full untruncated content by index, no query ──
      if (expand.length > 0 && !query) {
        const { rendered } = loadAllMessages(history, true);
        const available = new Set(rendered.map((e) => e.index));
        const invalid = invalidExpandIndices(expand, available);
        if (invalid.length > 0) {
          const where = scope === "all" ? "session history" : "active lineage";
          return {
            output: `Cannot expand indices outside ${where}: ${invalid.join(", ")}`,
          };
        }
        const wanted = new Set(expand);
        const expanded = rendered.filter((e) => wanted.has(e.index));
        return { output: scopePrefix(scope) + formatRecallOutput(expanded) };
      }

      // ── SEARCH mode: paginated ranked results ──
      if (query) {
        const { rendered, rawMessages } = loadAllMessages(history, false);
        const all = searchEntries(rendered, rawMessages, query);
        const page = Math.max(1, args.page ?? 1);
        const start = (page - 1) * PAGE_SIZE;
        const pageResults = all.slice(start, start + PAGE_SIZE);
        const totalPages = Math.ceil(all.length / PAGE_SIZE);
        const scopeNote = scope === "all" ? " (scope: all)" : "";
        const header =
          totalPages > 1
            ? `Page ${page}/${totalPages} (${all.length} total matches${scopeNote})`
            : `${all.length} matches${scopeNote}`;
        const footer =
          page < totalPages
            ? `\n--- Use page:${page + 1}${scope === "all" ? " with scope:'all'" : ""} for more results ---`
            : "";
        return {
          output: formatRecallOutput(pageResults, query, header) + footer,
        };
      }

      // ── BROWSE mode: last N entries ──
      const { rendered } = loadAllMessages(history, false);
      const recent = rendered.slice(-DEFAULT_RECENT);
      return { output: scopePrefix(scope) + formatRecallOutput(recent) };
    },
  });
