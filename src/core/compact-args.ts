export interface ParsedCompactionArgs {
  followUpPrompt: string;
  keepUserTurns: number | null;
  keepUserTurnsExplicit: boolean;
}

const KEEP_TOKEN_RE = /^keep:(\d+)$/;

/** Coerce a matched digit string to a turn count, clamping unsafe values. */
const parseKeepUserTurns = (raw: string): number => {
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
};

/**
 * Parse the argument string passed to the `/pi-vcc` command.
 *
 * Grammar (whitespace-separated tokens):
 *   - empty             → all defaults (no keep, no follow-up)
 *   - `keep:N ...rest`  → keepUserTurns=N, followUpPrompt=rest (leading token)
 *   - `...rest keep:N`  → keepUserTurns=N, followUpPrompt=rest (trailing token)
 *   - anything else     → the whole string is the follow-up prompt
 *
 * A `keep:N` in the middle of the string is NOT treated as a token.
 */
export const parseKeepAndPrompt = (args?: string): ParsedCompactionArgs => {
  const trimmed = args?.trim() ?? "";
  if (!trimmed) {
    return {
      followUpPrompt: "",
      keepUserTurns: null,
      keepUserTurnsExplicit: false,
    };
  }

  const startMatch = trimmed.match(/^keep:(\d+)(?:\s+|$)([\s\S]*)$/);
  if (startMatch) {
    return {
      followUpPrompt: (startMatch[2] ?? "").trim(),
      keepUserTurns: parseKeepUserTurns(startMatch[1] ?? ""),
      keepUserTurnsExplicit: true,
    };
  }

  const parts = trimmed.split(/\s+/);
  const lastToken = parts[parts.length - 1] ?? "";
  const endMatch = lastToken.match(KEEP_TOKEN_RE);
  if (endMatch) {
    return {
      followUpPrompt: trimmed
        .slice(0, trimmed.length - lastToken.length)
        .trim(),
      keepUserTurns: parseKeepUserTurns(endMatch[1] ?? ""),
      keepUserTurnsExplicit: true,
    };
  }

  return {
    followUpPrompt: trimmed,
    keepUserTurns: null,
    keepUserTurnsExplicit: false,
  };
};
