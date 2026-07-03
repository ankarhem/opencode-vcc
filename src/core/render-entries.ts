// ── opencode message/part shapes ──
// NOTE: kept intentionally minimal/pragmatic (id+role, and the handful of part
// fields the recall subsystem cares about) rather than importing the full SDK
// `Message`/`Part` unions, so this module stays easy to test in isolation.
// Real SDK objects are structurally compatible with these types.

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

const clip = (text: string, max = 200): string => {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  let end = cut > max * 0.6 ? cut : max;
  if (end > 0 && end < text.length) {
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end--;
  }
  return text.slice(0, end);
};

const isTextPart = (p: Part): p is TextPart => p.type === "text";

export const textOf = (parts: Part[]): string =>
  parts
    .filter(isTextPart)
    .map((p) => p.text)
    .join("\n");

const extractPath = (args: Record<string, unknown>): string | null => {
  for (const key of ["path", "file_path", "filePath", "file"]) {
    if (typeof args[key] === "string") return args[key] as string;
  }
  return null;
};

const summarizeToolArgs = (args: Record<string, unknown>): string => {
  const path = extractPath(args);
  if (path) return `path=${path}`;
  if (typeof args.command === "string") return `command=${args.command}`;
  if (typeof args.query === "string") return `query=${args.query}`;
  return Object.keys(args).join(", ");
};

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

export const renderMessage = (entry: HistoryEntry, index: number, full = false): RenderedEntry => {
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

  return { index, role: "assistant", summary, ...(files.length > 0 && { files }) };
};
