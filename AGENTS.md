# User Instructions

This file is the agent's persisted memory. Keep it concise — small, important instructions that prevent repeated mistakes. Improve it proactively when you learn something worth remembering. Does not require user approval — edit it right away and mention that you did it.

Always run `just validate` before committing.

# Agent Notes

- Single formatter: `nix fmt` (treefmt = prettier for TS/JSON/MD + nixfmt for .nix). Do NOT add a separate npm prettier — two prettier versions fight over line-breaking. `just validate` = `nix fmt` + `tsc --noEmit` + `bun test`.
- tsconfig is strict with `noUncheckedIndexedAccess` + `verbatimModuleSyntax`: `arr[i]` is `T | undefined` (guard with `?? ""`); use `import type` for type-only imports.

# Architecture (port of pi-vcc → opencode)

- opencode has NO no-LLM compaction-replacement hook. We use **echo + overwrite** (Architecture A): `experimental.session.compacting` computes the deterministic summary + sets a trivial echo prompt; `experimental.text.complete` overwrites the generated summary text. HARD GATE: only overwrite when the message ID is a recorded compaction-summary (`info.summary === true && info.agent === "compaction"`) — never ordinary chat text. Gate-miss fallback: if `output.text.trim() === "OK"` and `computed` exists, overwrite anyway (the echo target was created after `compacting()` fetched).
- Two compaction levels: (1) **default** — `augmentNativeSummary` in `text.complete` APPENDS RECALL_NOTE to opencode's own LLM summary (always on, no LLM cost; idempotent via `output.text.includes(RECALL_NOTE)` + `finalized` after augment); (2) **`/vcc`/override** — full deterministic replace. A `nativeCompacting` Map (set synchronously in `compacting()` default path, NOT cleared in `markFinalized()`) is the **primary signal** for the augment path — it bypasses the `finalized` gate. The `messages()` lookup with `info.summary === true && info.agent === "compaction"` is the hard gate verification for both paths. State lifecycle: `clearAfterOverwrite()` (deletes computed + pending, sets finalized) called after successful overwrite; `markFinalized()` (sets finalized, KEEPS computed) called by `session.compacted`/`session.error` event handler — computed must survive the race. Both hooks wrapped in try/catch (S7): on error, degrade to native compaction.
- The opencode message shape (`{ info: {id, role, summary?, agent?}, parts: Part[] }`) is defined ONCE in `src/core/render-entries.ts` (`HistoryEntry`/`Part`/`MessageInfo`). Import from there — single source of truth.
- Bash tool calls normalize to their own `{ kind: "bash", command, output, exitCode }` block (T2); `commits` and `brief` read `b.command`.
- `keep:N` is advisory (opencode owns the head/tail cut; we don't repartition via messages.transform).
- Recall reads `client.session.messages()` (NOT disk — opencode uses SQLite, not JSONL).
- DRY: `render-entries.ts` imports `clip`+`textOf` from `content.ts` and `extractPath`+`summarizeToolArgs` from `tool-args.ts` (no local copies). `textOf` is **re-exported** from `render-entries` so off-limits importers (`compaction.ts`, `normalize.ts`) keep resolving it there. The enabler: `content.ts`'s `ContentElem` has NO index signature — keeping one would make render-entries' `Part` union (whose index-signature members type `text` as `unknown`) unassignable, re-introducing the duplication. Don't re-add that index signature.
- Stop words: single source of truth is `src/core/stopwords.ts` (`STOPWORDS`, a `ReadonlySet<string>`). `brief.ts` (token-budget truncation) and `search-entries.ts` (query filtering) both import it. It's the superset of the two former inline lists.
- `pi-vcc` source (reference) cloned at `/tmp/pi-vcc` during development.
