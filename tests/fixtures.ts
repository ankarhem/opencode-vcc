// opencode-shaped message builders for tests.
// Each builder returns a HistoryEntry ({ info, parts }) using the Part/MessageInfo
// types from src/core/render-entries (the single source of truth for the shape).

import type {
  HistoryEntry,
  MessageInfo,
  ToolPart,
} from "../src/core/render-entries";

let idCounter = 0;
const nextId = (): string => `msg_${idCounter++}`;

const userInfo = (): MessageInfo => ({ id: nextId(), role: "user" });
const assistantInfo = (): MessageInfo => ({ id: nextId(), role: "assistant" });

export const userTextEntry = (text: string): HistoryEntry => ({
  info: userInfo(),
  parts: [{ type: "text", text }],
});

export const assistantTextEntry = (text: string): HistoryEntry => ({
  info: assistantInfo(),
  parts: [{ type: "text", text }],
});

export const assistantWithReasoningEntry = (text: string): HistoryEntry => ({
  info: assistantInfo(),
  parts: [
    { type: "reasoning", text: "internal thoughts" },
    { type: "text", text },
  ],
});

export const assistantToolCallEntry = (
  tool: string,
  input: Record<string, unknown>,
  state?: { status: string; output?: string },
): HistoryEntry => {
  const part: ToolPart = { type: "tool", tool, input };
  if (state) part.state = state;
  return { info: assistantInfo(), parts: [part] };
};

export const bashEntry = (
  command: string,
  output: string,
  exitCode?: number,
): HistoryEntry => {
  const status = exitCode && exitCode !== 0 ? "error" : "completed";
  const part: ToolPart = {
    type: "tool",
    tool: "bash",
    input: { command },
    state: { status, output },
  };
  return { info: assistantInfo(), parts: [part] };
};

export const history = (...entries: HistoryEntry[]): HistoryEntry[] => entries;
