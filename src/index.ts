import type { Plugin } from "@opencode-ai/plugin";
import type { HistoryEntry } from "./core/render-entries";
import { scaffoldSettings } from "./core/settings";
import { createAugmentHooks } from "./hooks/compaction";
import {
  createRecallCommandHook,
  recallCommandConfig,
  RECALL_COMMAND,
} from "./commands/recall";
import { createRecallTool } from "./tools/recall";

/**
 * Minimal structural view of the opencode SDK client methods this plugin uses.
 * The real client returns `RequestResult` wrappers ({ data, error }); the
 * adapter below unwraps `.data` into the plain shapes the hooks/tools expect.
 */
interface OpencodeClientLike {
  session: {
    messages(opts: {
      path: { id: string };
    }): Promise<{ data?: HistoryEntry[] }>;
  };
}

const fetchMessages =
  (client: OpencodeClientLike) =>
  async (args: { path: { id: string } }): Promise<HistoryEntry[]> => {
    const res = await client.session.messages(args);
    return res.data ?? [];
  };

export const VccPlugin: Plugin = async (input) => {
  scaffoldSettings();

  // The plugin's `client` is structurally a superset of OpencodeClientLike.
  const client = input.client as unknown as OpencodeClientLike;
  const messages = fetchMessages(client);

  const augment = createAugmentHooks({
    client: { session: { messages } },
  });

  const recallCommandHook = createRecallCommandHook({
    client: { session: { messages } },
  });
  const recallTool = createRecallTool({ client: { session: { messages } } });

  return {
    config: async (config: { command?: Record<string, unknown> }) => {
      config.command = config.command ?? {};
      config.command[RECALL_COMMAND] ??= recallCommandConfig;
    },
    "command.execute.before": async (
      cmdInput: { command: string; sessionID: string; arguments: string },
      output: { parts: unknown[] },
    ) => {
      await recallCommandHook(cmdInput, output);
    },
    "experimental.session.compacting":
      augment["experimental.session.compacting"],
    "experimental.text.complete": augment["experimental.text.complete"],
    event: augment.event,
    tool: { recall: recallTool },
  };
};

export default VccPlugin;
