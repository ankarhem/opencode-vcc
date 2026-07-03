# User Instructions

This file is the agent's persisted memory. Keep it concise — small, important instructions that prevent repeated mistakes. Improve it proactively when you learn something worth remembering. Does not require user approval — edit it right away and mention that you did it.

Always run `just validate` before committing.

# Agent Notes

- Single formatter: `nix fmt` (treefmt = prettier for TS/JSON/MD + nixfmt for .nix). Do NOT add a separate npm prettier — two prettier versions fight over line-breaking. `just validate` = `nix fmt` + `tsc --noEmit` + `bun test`.
- tsconfig is strict with `noUncheckedIndexedAccess` + `verbatimModuleSyntax`: `arr[i]` is `T | undefined` (guard with `?? ""`); use `import type` for type-only imports.

# Architecture (port of pi-vcc → opencode)

- opencode has NO no-LLM compaction-replacement hook. We use **echo + overwrite** (Architecture A): `experimental.session.compacting` computes the deterministic summary + sets a trivial echo prompt; `experimental.text.complete` overwrites the generated summary text. HARD GATE: only overwrite when the message ID is a recorded compaction-summary (`info.summary === true && info.agent === "compaction"`) — never ordinary chat text.
- The opencode message shape (`{ info: {id, role, summary?, agent?}, parts: Part[] }`) is defined ONCE in `src/core/render-entries.ts` (`HistoryEntry`/`Part`/`MessageInfo`). Import from there — single source of truth.
- Bash tool calls normalize to their own `{ kind: "bash", command, output, exitCode }` block (T2); `commits` and `brief` read `b.command`.
- `keep:N` is advisory (opencode owns the head/tail cut; we don't repartition via messages.transform).
- Recall reads `client.session.messages()` (NOT disk — opencode uses SQLite, not JSONL).
- Known minor DRY debt: `render-entries.ts` has local `clip`/`textOf`/`extractPath`/`summarizeToolArgs` byte-identical to `content.ts`/`tool-args.ts` — kept separate because the render-entries `Part` union (with index-signature members) isn't assignable to `content.ts`'s element type under strict mode.
- `pi-vcc` source (reference) cloned at `/tmp/pi-vcc` during development.
