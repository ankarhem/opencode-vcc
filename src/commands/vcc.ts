import { parseKeepAndPrompt } from "../core/compact-args";
import type { PendingRequest } from "../hooks/compaction";

export interface VccCommandDeps {
  client: {
    session: {
      summarize: (args: { path: { id: string } }) => Promise<unknown>;
    };
  };
}

export const VCC_COMMAND = "vcc";

/** Config entry registering the /vcc slash command. */
export const vccCommandConfig = {
  template: " ",
  description:
    "Compact the conversation now (algorithmic, no LLM summary). Usage: /vcc [keep:N] [follow-up prompt]",
};

/**
 * command.execute.before handler for /vcc: parse keep:N + follow-up, record
 * the pending request (read by the compaction hook), trigger compaction, and
 * blank the command's parts so it never becomes a user turn.
 */
export const createVccCommandHook =
  (
    deps: VccCommandDeps,
    setPending: (sessionID: string, request: PendingRequest) => void,
  ) =>
  async (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: unknown[] },
  ): Promise<void> => {
    if (input.command !== VCC_COMMAND) return;

    const parsed = parseKeepAndPrompt(input.arguments);
    setPending(input.sessionID, {
      keepN: parsed.keepUserTurns,
      followUpPrompt: parsed.followUpPrompt || undefined,
    });

    try {
      await deps.client.session.summarize({ path: { id: input.sessionID } });
    } catch {
      // best-effort: the compaction hook is idempotent; a failed trigger just
      // leaves the pending entry to be TTL-evicted.
    }

    output.parts = [];
  };
