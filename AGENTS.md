# User Instructions

This file is the agent's persisted memory. Keep it concise — small, important instructions that prevent repeated mistakes. Improve it proactively when you learn something worth remembering. Does not require user approval — edit it right away and mention that you did it.

Always run `just validate` before committing.

# Agent Notes

- Single formatter: `nix fmt` (treefmt = prettier for TS/JSON/MD + nixfmt for .nix). Do NOT add a separate npm prettier — two prettier versions fight over line-breaking. `just validate` = `nix fmt` + `tsc --noEmit` + `bun test`.
- tsconfig is strict with `noUncheckedIndexedAccess` + `verbatimModuleSyntax`: `arr[i]` is `T | undefined` (guard with `?? ""`); use `import type` for type-only imports.

# Architecture (port of pi-vcc → opencode)

- **Augment-only design**: opencode has NO no-LLM compaction-replacement hook. The plugin does NOT override compaction — it augments opencode's native LLM summary by appending `RECALL_NOTE`. The `experimental.session.compacting` hook just records the sessionID in a `Set`; `experimental.text.complete` checks the set, does a hard-gate message lookup (`info.summary === true && info.agent === "compaction"`), and appends `RECALL_NOTE`. The `event` handler cleans up the set on `session.compacted`/`session.error`. All hooks wrapped in try/catch: on error, degrade silently.
- The opencode message shape (`{ info: {id, role, summary?, agent?}, parts: Part[] }`) is defined ONCE in `src/core/render-entries.ts` (`HistoryEntry`/`Part`/`MessageInfo`). Import from there — single source of truth.
- Recall reads `client.session.messages()` (NOT disk — opencode uses SQLite, not JSONL).
- DRY: `render-entries.ts` imports `clip`+`textOf` from `content.ts` and `extractPath`+`summarizeToolArgs` from `tool-args.ts` (no local copies).
- Stop words: single source of truth is `src/core/stopwords.ts` (`STOPWORDS`, a `ReadonlySet<string>`). `search-entries.ts` imports it for query filtering.
- `RECALL_NOTE` lives in `src/core/format.ts` — the only export from that file. It's the imperative text appended to compaction summaries telling the agent to use the `recall` tool.
- Tool name is `recall` (registered as `tool: { recall: ... }` in `src/index.ts`). Command is `/recall` (in `src/commands/recall.ts`).
