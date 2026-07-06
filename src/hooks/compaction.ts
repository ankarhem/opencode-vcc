import { RECALL_NOTE } from "../core/format";
import type { HistoryEntry } from "../core/render-entries";

/**
 * Hook surface for augmenting opencode's native compaction summaries.
 *
 * After opencode produces its LLM compaction summary, RECALL_NOTE is appended
 * so the agent knows it can recover pre-compaction context via the `recall`
 * tool. There is no override path — opencode's native summary is always
 * preserved.
 */
export interface AugmentHookDeps {
  client: {
    session: {
      messages(args: { path: { id: string } }): Promise<HistoryEntry[]>;
    };
  };
}

export interface AugmentHooks {
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
}

/**
 * Build hooks that append RECALL_NOTE to opencode's native compaction summaries.
 *
 * Flow:
 * 1. `compacting` fires -> record the sessionID (signals a compaction is in
 *    progress).
 * 2. `text.complete` fires -> if the session is compacting, verify via message
 *    lookup that the message is a compaction summary, then append RECALL_NOTE.
 * 3. `event` (session.compacted / session.error) -> clean up the recorded
 *    sessionID as a safety net.
 *
 * The message lookup is a hard gate (`info.summary === true && info.agent ===
 * "compaction"`) ensuring RECALL_NOTE is never appended to ordinary chat text.
 * State lives in closures per factory instance, never as module globals.
 */
export function createAugmentHooks(deps: AugmentHookDeps): AugmentHooks {
  // Sessions currently in the compaction phase. Set by the compacting hook,
  // consumed + deleted by text.complete, safety-net cleaned by the event hook.
  const compactingSessions = new Set<string>();

  const compacting = async (
    input: { sessionID: string },
    _output: { context: string[]; prompt?: string },
  ): Promise<void> => {
    compactingSessions.add(input.sessionID);
  };

  const textComplete = async (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ): Promise<void> => {
    try {
      if (!compactingSessions.has(input.sessionID)) return;
      // Idempotent: never double-append.
      if (output.text.includes(RECALL_NOTE)) return;

      // Hard gate: verify this message is a compaction summary.
      const messages = await deps.client.session.messages({
        path: { id: input.sessionID },
      });
      const msg = messages.find((m) => m.info.id === input.messageID);
      if (!msg || msg.info.summary !== true || msg.info.agent !== "compaction")
        return;

      compactingSessions.delete(input.sessionID);
      output.text = `${output.text.trimEnd()}\n\n${RECALL_NOTE}`;
    } catch {
      // best-effort; never crash the text completion
    }
  };

  const event = async (input: {
    event: { type: string; [k: string]: unknown };
  }): Promise<void> => {
    const { type } = input.event;
    if (type !== "session.compacted" && type !== "session.error") return;

    const props = input.event.properties;
    if (!props || typeof props !== "object") return;
    const sessionID = (props as { sessionID?: unknown }).sessionID;
    if (typeof sessionID === "string") compactingSessions.delete(sessionID);
  };

  return {
    "experimental.session.compacting": compacting,
    "experimental.text.complete": textComplete,
    event,
  };
}
