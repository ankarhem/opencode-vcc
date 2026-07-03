import type { Plugin } from "@opencode-ai/plugin";
import type { HistoryEntry } from "./core/render-entries";
import { loadSettings, scaffoldSettings } from "./core/settings";
import { createCompactionHooks } from "./hooks/compaction";
import {
  createVccCommandHook,
  vccCommandConfig,
  VCC_COMMAND,
} from "./commands/vcc";
import {
  createVccRecallCommandHook,
  vccRecallCommandConfig,
  VCC_RECALL_COMMAND,
} from "./commands/vcc-recall";
import { createVccRecallTool } from "./tools/recall";

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
    summarize(opts: { path: { id: string } }): Promise<unknown>;
    prompt(opts: {
      path: { id: string };
      body: { parts: Array<{ type: "text"; text: string }> };
    }): Promise<unknown>;
  };
  tui: {
    showToast(opts: {
      body: {
        message: string;
        variant: "info" | "success" | "warning" | "error";
      };
    }): Promise<unknown>;
  };
}

const fetchMessages =
  (client: OpencodeClientLike) =>
  async (args: { path: { id: string } }): Promise<HistoryEntry[]> => {
    const res = await client.session.messages(args);
    return res.data ?? [];
  };

export const VccPlugin: Plugin = async (input, options) => {
  scaffoldSettings();
  const settings = loadSettings(options);

  // The plugin's `client` is structurally a superset of OpencodeClientLike.
  const client = input.client as unknown as OpencodeClientLike;
  const messages = fetchMessages(client);

  const compaction = createCompactionHooks({
    client: {
      session: {
        messages,
        prompt: (sessionID, content) =>
          client.session.prompt({
            path: { id: sessionID },
            body: { parts: [{ type: "text", text: content }] },
          }),
      },
      tui: {
        showToast: (args) =>
          client.tui.showToast({
            body: {
              message: args.body.message,
              variant: args.body.variant as
                | "info"
                | "success"
                | "warning"
                | "error",
            },
          }),
      },
    },
    settings,
  });

  const vccHook = createVccCommandHook(
    {
      client: {
        session: { summarize: client.session.summarize.bind(client.session) },
      },
    },
    compaction.setPending,
  );
  const recallCommandHook = createVccRecallCommandHook({
    client: { session: { messages } },
  });
  const recallTool = createVccRecallTool({ client: { session: { messages } } });

  return {
    config: async (config: { command?: Record<string, unknown> }) => {
      config.command = config.command ?? {};
      config.command[VCC_COMMAND] ??= vccCommandConfig;
      config.command[VCC_RECALL_COMMAND] ??= vccRecallCommandConfig;
    },
    "command.execute.before": async (
      cmdInput: { command: string; sessionID: string; arguments: string },
      output: { parts: unknown[] },
    ) => {
      await vccHook(cmdInput, output);
      await recallCommandHook(cmdInput, output);
    },
    "experimental.session.compacting":
      compaction["experimental.session.compacting"],
    "experimental.text.complete": compaction["experimental.text.complete"],
    event: compaction.event,
    tool: { vcc_recall: recallTool },
  };
};

export default VccPlugin;
