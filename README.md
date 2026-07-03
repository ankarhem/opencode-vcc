# opencode-vcc

An **algorithmic** conversation compactor for [opencode](https://opencode.ai) — a
port of [pi-vcc](https://github.com/sting8k/pi-vcc). Instead of asking an LLM to
summarize the conversation when it needs compacting, opencode-vcc extracts
structured facts (goal, files touched, commits, blockers, preferences) via
regex/heuristics and renders a deterministic **brief transcript**.

- **Deterministic** — same input → same output.
- **Cheap & fast** — no summarization API call for the summary itself.
- **Lossless recall** — the `vcc_recall` tool re-reads the full session history
  (including turns hidden by compaction), so nothing is truly gone.

## How it works (and one important caveat)

opencode does **not** expose a hook that replaces the compaction summary without
an LLM call. opencode-vcc therefore uses the **echo + overwrite** strategy:

1. `experimental.session.compacting` — compute the deterministic summary from the
   full session history, and set the compaction prompt to a trivial echo
   (`"Reply with exactly: OK"`) so the model call is minimal.
2. `experimental.text.complete` — when the compaction summary message's text
   completes, overwrite it with the deterministic summary. A **hard gate**
   (`info.summary === true && info.agent === "compaction"`, matched by message
   ID) ensures only the compaction summary is ever overwritten — never ordinary
   chat text.

> **Cost note:** one tiny LLM turn is still made per compaction (the echo). This
> is the price of not reimplementing opencode's compaction bookkeeping. The
> summary content itself is 100% algorithmic.

### `keep:N` is advisory

In pi-vcc, `keep:N` controls exactly how many trailing user turns stay
uncompacted. In opencode, the host owns the head/tail cut — the plugin cannot
repartition it from the compacting hook. So `keep:N` is recorded for stats/intent
but the exact retained tail is chosen by opencode. Treat `keep:N` as advisory.

## Install

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-vcc"]
}
```

Or with per-plugin options (see Configuration):

```json
{
  "plugin": [["opencode-vcc", { "overrideDefaultCompaction": true }]]
}
```

Or drop it in `.opencode/plugins/` / `~/.config/opencode/plugins/` as a local
plugin.

## Commands

### `/pi-vcc [keep:N] [follow-up prompt]`

Compact the conversation **now** using the algorithmic summarizer.

- `keep:N` — advisory count of trailing user turns to keep (see caveat above).
  May appear at the start or end of the arguments.
- `follow-up prompt` — an optional prompt sent to the agent after compaction
  completes.

Examples:

```
/pi-vcc
/pi-vcc keep:3
/pi-vcc keep:2 continue implementing the parser
/pi-vcc summarize what's left keep:1
```

### `/pi-vcc-recall <query> [page:N] [scope:all]`

Search the full session history and feed the results to the agent as a new turn.

- `<query>` — search terms (natural-language, BM25-ranked) or a regex (any query
  containing regex metacharacters is treated as a pattern).
- `page:N` — results are paged 5 at a time.
- `scope:all` — include off-lineage branches (default: active lineage).

## Tool: `vcc_recall`

An agent-invocable tool for searching / browsing / expanding prior context —
including turns removed from the live context by compaction.

| Argument | Type                    | Meaning                                        |
| -------- | ----------------------- | ---------------------------------------------- |
| `query`  | string?                 | Search terms or regex. Omit to browse.         |
| `expand` | number[]?               | Entry indices to return in full (untruncated). |
| `page`   | number?                 | 1-based page for search results (5 per page).  |
| `scope`  | `"lineage"` \| `"all"`? | Default `"lineage"`.                           |

Modes:

- **search** (`query` set) — ranked, paged matches with context snippets.
- **browse** (nothing set) — the last 25 entries.
- **expand** (`expand` set, no `query`) — full content of the given entry indices.
  Indices are stable across scope switches; invalid indices return an
  explanatory message.

## Configuration

Settings resolve with the precedence **env > plugin options > sidecar file >
defaults**.

| Key                         | Default | Meaning                                                                                                             |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `overrideDefaultCompaction` | `false` | When `true`, opencode-vcc handles **all** compactions (including `/compact` and auto-overflow), not just `/pi-vcc`. |
| `debug`                     | `false` | Write a diagnostic snapshot to `/tmp/opencode-vcc-debug.json` on each compaction.                                   |

- **Plugin options** — the second element of a `["opencode-vcc", { ... }]` entry
  in `opencode.json`.
- **Sidecar file** — `~/.config/opencode/opencode-vcc.json` (auto-scaffolded with
  defaults on first load; missing keys are merged non-destructively). Override
  the path with `OPENCODE_VCC_CONFIG_PATH`.
- **Env** — `OPENCODE_VCC_OVERRIDE_DEFAULT_COMPACTION` and `OPENCODE_VCC_DEBUG`
  (`true`/`1` or `false`/`0`).

## Development

```
just validate   # nix fmt + tsc --noEmit + bun test
just test
just typecheck
```

Formatting is handled entirely by `nix fmt` (treefmt: prettier + nixfmt). Run
`just validate` before committing.

## License

MIT
