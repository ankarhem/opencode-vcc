import { writeFileSync } from "node:fs";

import { compile } from "../core/summarize";
import { textOf } from "../core/render-entries";
import type { HistoryEntry } from "../core/render-entries";
import type { VccSettings } from "../core/settings";
import { formatCompactionStats } from "../core/report";
import type { CompactionStats } from "../core/report";

/**
 * Mockable surface of the opencode client the compaction hooks depend on.
 * The real plugin adapts `PluginInput.client` to this shape in the wiring layer.
 */
export interface CompactionHookDeps {
  client: {
    session: {
      messages(args: { path: { id: string } }): Promise<HistoryEntry[]>;
      prompt(content: string): Promise<unknown>;
    };
    tui: {
      showToast(args: {
        body: { message: string; variant: string };
      }): Promise<unknown>;
    };
  };
  settings: VccSettings;
  /** Injectable clock (defaults to Date.now) for deterministic TTL tests. */
  now?: () => number;
  /** Injectable debug sink (defaults to a best-effort /tmp file write). */
  debugWrite?: (data: unknown) => void;
}

export interface PendingRequest {
  keepN: number | null;
  followUpPrompt?: string;
}

export interface CompactionHooks {
  "experimental.session.compacting": (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => Promise<void>;
  "experimental.text.complete": (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ) => Promise<void>;
  event: (input: {
    event: { type: string; [k: string]: unknown };
  }) => Promise<void>;
  setPending: (sessionID: string, request: PendingRequest) => void;
}

const TTL_MS = 60_000;
const ECHO_PROMPT = "Reply with exactly: OK";
const DEBUG_PATH = "/tmp/opencode-vcc-debug.json";

interface PendingEntry {
  keepN: number | null;
  followUpPrompt?: string;
  requestedAt: number;
}

interface ComputedEntry {
  summaryText: string;
  stats: CompactionStats;
  summaryMsgIds: Set<string>;
}

/**
 * Extract the text of the last NON-EMPTY summary message (`info.summary === true`).
 *
 * The freshly-created compaction target message is also `summary === true` but is
 * still empty when `session.compacting` fires (its text streams in afterwards), so
 * skipping empties yields the genuine previous summary to merge against.
 */
export const extractPreviousSummary = (
  messages: HistoryEntry[],
): string | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = messages[i];
    if (!entry || entry.info.summary !== true) continue;
    const text = textOf(entry.parts);
    if (text) return text;
  }
  return undefined;
};

const defaultDebugWrite = (data: unknown): void => {
  try {
    writeFileSync(DEBUG_PATH, JSON.stringify(data, null, 2));
  } catch {
    // best-effort; never crash the compaction path
  }
};

/**
 * Build the three opencode compaction hooks (Architecture A: echo-prompt +
 * text-complete overwrite). State lives in closures per factory instance, never
 * as module globals.
 */
export function createCompactionHooks(
  deps: CompactionHookDeps,
): CompactionHooks {
  const now = deps.now ?? (() => Date.now());
  const debugWrite = deps.debugWrite ?? defaultDebugWrite;
  const pending = new Map<string, PendingEntry>();
  const computed = new Map<string, ComputedEntry>();

  /** Drop entries whose pending request has aged past the TTL. */
  const evictStale = (): void => {
    const cutoff = now() - TTL_MS;
    for (const [id, entry] of pending) {
      if (entry.requestedAt < cutoff) {
        pending.delete(id);
        computed.delete(id);
      }
    }
  };

  /** Write a debug snapshot when enabled; never throws. */
  const dump = (data: Record<string, unknown>): void => {
    if (!deps.settings.debug) return;
    try {
      debugWrite(data);
    } catch {
      // never throw from the debug path
    }
  };

  const clear = (sessionID: string): void => {
    pending.delete(sessionID);
    computed.delete(sessionID);
  };

  const setPending = (sessionID: string, request: PendingRequest): void => {
    pending.set(sessionID, {
      keepN: request.keepN,
      followUpPrompt: request.followUpPrompt,
      requestedAt: now(),
    });
  };

  const compacting = async (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ): Promise<void> => {
    evictStale();
    const { sessionID } = input;
    const pendingEntry = pending.get(sessionID);
    const handle =
      pendingEntry !== undefined || deps.settings.overrideDefaultCompaction;
    if (!handle) return; // defer to opencode's native LLM compaction

    const messages = await deps.client.session.messages({
      path: { id: sessionID },
    });
    const previousSummary = extractPreviousSummary(messages);
    const summaryText = compile({ messages, previousSummary });

    const keepN = pendingEntry?.keepN ?? null;
    const stats: CompactionStats = {
      summarized: messages.length,
      previousSummaryUsed: Boolean(previousSummary),
      keepN,
      requestedKeepExplicit: keepN !== null,
    };

    if (!summaryText) {
      // Nothing to compact: let native compaction proceed. Structure-only dump.
      dump({
        phase: "compacting",
        sessionID,
        result: "empty-summary",
        messageCount: messages.length,
        previousSummaryUsed: stats.previousSummaryUsed,
      });
      return;
    }

    const summaryMsgIds = new Set<string>();
    for (const entry of messages) {
      if (entry.info.summary === true) summaryMsgIds.add(entry.info.id);
    }

    computed.set(sessionID, { summaryText, stats, summaryMsgIds });
    // Minimal echo: the LLM produces "OK", then text.complete overwrites it with
    // our deterministic summary.
    output.prompt = ECHO_PROMPT;

    dump({
      phase: "compacting",
      sessionID,
      result: "computed",
      messageCount: messages.length,
      summaryMsgIds: [...summaryMsgIds],
      stats,
      summaryPreview: summaryText.slice(0, 300),
    });
  };

  const textComplete = async (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ): Promise<void> => {
    const c = computed.get(input.sessionID);
    if (!c) return; // don't touch non-pending sessions
    // HARD GATE: only overwrite the recorded compaction summary message, never
    // ordinary chat text. This is the critical safety property.
    if (!c.summaryMsgIds.has(input.messageID)) return;

    output.text = c.summaryText;

    const followUpPrompt = pending.get(input.sessionID)?.followUpPrompt;
    clear(input.sessionID);

    try {
      await deps.client.tui.showToast({
        body: { message: formatCompactionStats(c.stats), variant: "info" },
      });
    } catch {
      // toast is best-effort
    }

    if (followUpPrompt) {
      try {
        await deps.client.session.prompt(followUpPrompt);
      } catch {
        // follow-up is fire-and-forget
      }
    }

    dump({
      phase: "text.complete",
      sessionID: input.sessionID,
      messageID: input.messageID,
      overwritten: true,
      followUpSent: Boolean(followUpPrompt),
      stats: c.stats,
    });
  };

  const event = async (input: {
    event: { type: string; [k: string]: unknown };
  }): Promise<void> => {
    const { type } = input.event;
    if (type !== "session.compacted" && type !== "session.error") return;

    // TTL safety net: clean up in case text.complete never gated in.
    const props = input.event.properties;
    if (!props || typeof props !== "object") return;
    const sessionID = (props as { sessionID?: unknown }).sessionID;
    if (typeof sessionID !== "string") return;

    clear(sessionID);
  };

  return {
    "experimental.session.compacting": compacting,
    "experimental.text.complete": textComplete,
    event,
    setPending,
  };
}
