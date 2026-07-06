import { writeFileSync } from "node:fs";

import { compile } from "../core/summarize";
import { RECALL_NOTE } from "../core/format";
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
      prompt(sessionID: string, content: string): Promise<unknown>;
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
  // Sessions we already handled+cleared; blocks augmentNativeSummary from
  // re-touching an already-processed compaction. TTL-evicted like pending.
  const finalized = new Map<string, number>();
  // Proactive signal for default-path compactions. NOT cleared in clear() —
  // must survive the session.compacted race (see augmentNativeSummary).
  const nativeCompacting = new Map<string, number>();

  const evictStale = (): void => {
    const cutoff = now() - TTL_MS;
    for (const [id, entry] of pending) {
      if (entry.requestedAt < cutoff) {
        pending.delete(id);
        computed.delete(id);
      }
    }
    for (const [id, at] of finalized) {
      if (at < cutoff) finalized.delete(id);
    }
    for (const [id, at] of nativeCompacting) {
      if (at < cutoff) nativeCompacting.delete(id);
    }
  };

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
    finalized.set(sessionID, now());
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
    if (!handle) {
      nativeCompacting.set(sessionID, now());
      return;
    }
    nativeCompacting.delete(sessionID);

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

  const applyAugment = (
    input: { sessionID: string; messageID: string },
    output: { text: string },
    source: string,
  ): void => {
    output.text = `${output.text.trimEnd()}\n\n${RECALL_NOTE}`;
    finalized.set(input.sessionID, now());
    dump({
      phase: "augment",
      sessionID: input.sessionID,
      messageID: input.messageID,
      source,
    });
  };

  // Default-compaction path: append RECALL_NOTE to opencode's own LLM summary.
  const augmentNativeSummary = async (
    input: { sessionID: string; messageID: string },
    output: { text: string },
  ): Promise<void> => {
    if (output.text.includes(RECALL_NOTE)) return;

    const nativeStarted = nativeCompacting.has(input.sessionID);

    // Skip finalized gate when nativeCompacting is set: session.compacted may
    // have raced ahead and set finalized before we got to augment.
    if (!nativeStarted && finalized.has(input.sessionID)) return;

    if (nativeStarted) {
      nativeCompacting.delete(input.sessionID);
      applyAugment(input, output, "nativeCompacting");
      return;
    }

    // Fallback for when compacting() didn't fire (e.g. plugin loaded mid-session).
    const messages = await deps.client.session.messages({
      path: { id: input.sessionID },
    });
    const msg = messages.find((m) => m.info.id === input.messageID);
    if (!msg) return;
    if (msg.info.summary !== true || msg.info.agent !== "compaction") return;

    applyAugment(input, output, "fallback-lookup");
  };

  const textComplete = async (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ): Promise<void> => {
    const c = computed.get(input.sessionID);
    if (!c) {
      await augmentNativeSummary(input, output);
      return;
    }
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
        await deps.client.session.prompt(input.sessionID, followUpPrompt);
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
