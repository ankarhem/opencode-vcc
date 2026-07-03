import type { NormalizedBlock } from "../core/types";

interface CommitInfo {
  hash?: string;
  message: string;
}

const COMMIT_MSG_RE =
  /git\s+commit[^\n]*?-m\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\$?'((?:[^'\\]|\\.)*)')/;
// Match short hash from git output: "[branch hash]" or "main hash" or 7-12 hex
const HASH_RE = /\b([0-9a-f]{7,12})\b/;

const firstLineOf = (text: string): string => {
  const line = text.split(/\\n|\n/)[0] ?? "";
  return line.trim();
};

const cleanMessage = (msg: string): string =>
  msg.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();

/**
 * Look for a commit hash in freeform git output text: bracketed
 * "[branch hash]", a hash range "hash..hash" (second wins), or a bare hash.
 */
const findHash = (text: string): string | undefined => {
  const bracket = text.match(/\[\S+\s+([0-9a-f]{7,12})\]/);
  if (bracket) return bracket[1];
  const range = text.match(/\b([0-9a-f]{7,12})\.\.([0-9a-f]{7,12})\b/);
  if (range) return range[2];
  const plain = text.match(HASH_RE);
  if (plain) return plain[1];
  return undefined;
};

/**
 * Extract git commits from bash blocks (`git commit -m "..."`) and pair
 * with a hash from the bash block's own output, falling back to a look-ahead
 * over the next few tool_result blocks (kept for parity with pi-vcc's model,
 * where a bash tool_call and its result are separate blocks).
 */
export const extractCommits = (blocks: NormalizedBlock[]): CommitInfo[] => {
  const commits: CommitInfo[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || b.kind !== "bash") continue;
    const cmd = b.command;
    if (!/\bgit\s+commit\b/.test(cmd)) continue;
    const m = cmd.match(COMMIT_MSG_RE);
    if (!m) continue;
    const message = firstLineOf(cleanMessage(m[1] ?? m[2] ?? m[3] ?? ""));
    if (!message) continue;

    let hash: string | undefined = findHash(b.output);

    if (!hash) {
      for (let j = i + 1; j < Math.min(blocks.length, i + 3); j++) {
        const r = blocks[j];
        if (!r || r.kind !== "tool_result") continue;
        hash = findHash(r.text);
        if (hash) break;
      }
    }

    // Dedup by message+hash
    const key = `${hash ?? ""}::${message}`;
    if (!commits.some((c) => `${c.hash ?? ""}::${c.message}` === key)) {
      commits.push({ hash, message });
    }
  }

  return commits;
};

export const formatCommits = (commits: CommitInfo[], limit = 8): string[] => {
  const lines: string[] = [];
  const items = commits.slice(-limit); // keep most recent
  for (const c of items) {
    const prefix = c.hash ? `${c.hash}: ` : "";
    lines.push(`${prefix}${c.message}`);
  }
  return lines;
};
