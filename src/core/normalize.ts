import {
  textOf,
  type HistoryEntry,
  type Part,
  type ReasoningPart,
  type TextPart,
  type ToolPart,
} from "./render-entries";
import type { NormalizedBlock } from "./types";
import { sanitize } from "./sanitize";

const isTextPart = (p: Part): p is TextPart => p.type === "text";
const isReasoningPart = (p: Part): p is ReasoningPart => p.type === "reasoning";
const isToolPart = (p: Part): p is ToolPart => p.type === "tool";

// opencode's tool part carries a terminal status; treat only explicit errors as
// non-zero. No state → no known exit code (undefined).
const exitCodeFromState = (state: ToolPart["state"]): number | undefined =>
  state === undefined ? undefined : state.status === "error" ? 1 : 0;

const normalizeUser = (
  parts: Part[],
  sourceIndex: number,
): NormalizedBlock[] => {
  const blocks: NormalizedBlock[] = [];
  const text = sanitize(textOf(parts));
  if (text) blocks.push({ kind: "user", text, sourceIndex });
  for (const part of parts) {
    if (part.type === "file") {
      const mime = typeof part.mime === "string" ? part.mime : "unknown";
      blocks.push({ kind: "user", text: `[image: ${mime}]`, sourceIndex });
    }
  }
  return blocks.length > 0 ? blocks : [{ kind: "user", text: "", sourceIndex }];
};

const normalizeAssistant = (
  parts: Part[],
  sourceIndex: number,
): NormalizedBlock[] => {
  const blocks: NormalizedBlock[] = [];
  for (const part of parts) {
    if (isTextPart(part)) {
      blocks.push({
        kind: "assistant",
        text: sanitize(part.text),
        sourceIndex,
      });
    } else if (isReasoningPart(part)) {
      // Reasoning is opencode's equivalent of pi's thinking blocks — dropped.
      continue;
    } else if (isToolPart(part)) {
      const command = part.input?.command;
      const isBash = part.tool === "bash" || part.tool === "Bash";
      if (isBash && typeof command === "string") {
        blocks.push({
          kind: "bash",
          command,
          output: part.state?.output ?? "",
          exitCode: exitCodeFromState(part.state),
          sourceIndex,
        });
      } else {
        blocks.push({
          kind: "tool_call",
          name: part.tool,
          args: part.input ?? {},
          sourceIndex,
        });
        // opencode merges the tool result onto the same part; re-emit it as a
        // separate block to preserve pi-vcc's toolCall→toolResult pairing.
        const output = part.state?.output;
        if (output !== undefined) {
          blocks.push({
            kind: "tool_result",
            name: part.tool,
            text: sanitize(output),
            sourceIndex,
          });
        }
      }
    }
  }
  return blocks;
};

const normalizeOne = (
  entry: HistoryEntry,
  sourceIndex: number,
): NormalizedBlock[] => {
  const { info, parts } = entry;
  if (info.role === "user") return normalizeUser(parts, sourceIndex);
  if (info.role === "assistant") return normalizeAssistant(parts, sourceIndex);
  return [];
};

export const normalize = (history: HistoryEntry[]): NormalizedBlock[] =>
  history.flatMap((entry, i) => normalizeOne(entry, i));
