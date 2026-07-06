// ── opencode message/part shapes ──
// NOTE: kept intentionally minimal/pragmatic (id+role, and the handful of part
// fields the recall subsystem cares about) rather than importing the full SDK
// `Message`/`Part` unions, so this module stays easy to test in isolation.
// Real SDK objects are structurally compatible with these types.

import { clip, textOf } from "./content";
import { extractPath, summarizeToolArgs } from "./tool-args";

// Re-export so existing importers (compaction.ts, normalize.ts) keep resolving
// textOf from this module while the implementation lives in content.ts.
export { textOf };

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolPart {
  type: "tool";
  tool: string;
  input?: Record<string, unknown>;
  state?: { status: string; output?: string };
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
}

export interface FilePart {
  type: "file";
  [key: string]: unknown;
}

export type Part =
  | TextPart
  | ToolPart
  | ReasoningPart
  | FilePart
  | { type: string; [key: string]: unknown };

export interface MessageInfo {
  id: string;
  role: "user" | "assistant";
  [key: string]: unknown;
}

export interface HistoryEntry {
  info: MessageInfo;
  parts: Part[];
}

export interface RenderedEntry {
  index: number;
  role: string;
  summary: string;
  files?: string[];
}

const isToolPart = (p: Part): p is ToolPart => p.type === "tool";

/**
 * Render a single tool part. opencode merges tool-call + tool-result into one
 * part with `.state`: if it carries a terminal `.state.output`, render it like
 * pi-vcc's `toolResult` message; otherwise render like an assistant tool-call
 * one-liner (name + arg summary).
 */
const renderToolPart = (p: ToolPart, full: boolean): string => {
  if (p.state?.output !== undefined) {
    const out = full ? p.state.output : clip(p.state.output, 200);
    return `[${p.tool}] ${out}`;
  }
  return `${p.tool}(${summarizeToolArgs(p.input ?? {})})`;
};

const extractFilesFromParts = (parts: Part[]): string[] =>
  parts
    .filter(isToolPart)
    .map((p) => extractPath(p.input ?? {}))
    .filter((f): f is string => f !== null);

export const renderMessage = (
  entry: HistoryEntry,
  index: number,
  full = false,
): RenderedEntry => {
  const { info, parts } = entry;
  const text = textOf(parts);

  if (info.role === "user") {
    return { index, role: "user", summary: full ? text : clip(text, 300) };
  }

  const toolParts = parts.filter(isToolPart);
  const toolLines = toolParts.map((p) => renderToolPart(p, full));
  const files = extractFilesFromParts(parts);

  const tools = toolLines.join(", ");
  const body = full ? text : clip(text, 300);
  const summary = tools ? (body ? `${tools}\n${body}` : tools) : body;

  return {
    index,
    role: "assistant",
    summary,
    ...(files.length > 0 && { files }),
  };
};
