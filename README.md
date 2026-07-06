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

### Default compaction is augmented, not replaced

When you do **not** use `/vcc` (and `overrideDefaultCompaction` is off), opencode
runs its normal LLM compaction. In that case opencode-vcc leaves the LLM's
narrative summary intact and simply **appends the recall note** to it, so the
agent learns the `vcc_recall` tool exists and can recover any pre-compaction
detail losslessly. This is always on, adds no LLM cost, and is hard-gated to
genuine compaction summaries (`info.summary === true && info.agent ===
"compaction"`) — ordinary chat text is never touched.

So there are two levels:

- **Default** — opencode's LLM summary + appended recall note (best of both:
  narrative synthesis _and_ a lossless recovery path).
- **`/vcc` (or `overrideDefaultCompaction: true`)** — fully deterministic,
  hallucination-free algorithmic summary that replaces the LLM summary.

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

### `/vcc [keep:N] [follow-up prompt]`

Compact the conversation **now** using the algorithmic summarizer.

- `keep:N` — advisory count of trailing user turns to keep (see caveat above).
  May appear at the start or end of the arguments.
- `follow-up prompt` — an optional prompt sent to the agent after compaction
  completes.

Examples:

```
/vcc
/vcc keep:3
/vcc keep:2 continue implementing the parser
/vcc summarize what's left keep:1
```

### `/vcc-recall <query> [page:N]`

Search the full session history and feed the results to the agent as a new turn.

- `<query>` — search terms (natural-language, BM25-ranked) or a regex (any query
  containing regex metacharacters is treated as a pattern).
- `page:N` — results are paged 5 at a time.

## Tool: `vcc_recall`

An agent-invocable tool for searching / browsing / expanding prior context —
including turns removed from the live context by compaction.

| Argument | Type      | Meaning                                        |
| -------- | --------- | ---------------------------------------------- |
| `query`  | string?   | Search terms or regex. Omit to browse.         |
| `expand` | number[]? | Entry indices to return in full (untruncated). |
| `page`   | number?   | 1-based page for search results (5 per page).  |

Modes:

- **search** (`query` set) — ranked, paged matches with context snippets.
- **browse** (nothing set) — the last 25 entries.
- **expand** (`expand` set, no `query`) — full content of the given entry indices.
  Invalid indices return an explanatory message.

## Configuration

Settings resolve with the precedence **env > plugin options > sidecar file >
defaults**.

| Key                         | Default | Meaning                                                                                                          |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `overrideDefaultCompaction` | `false` | When `true`, opencode-vcc handles **all** compactions (including `/compact` and auto-overflow), not just `/vcc`. |
| `debug`                     | `false` | Write a diagnostic snapshot to `/tmp/opencode-vcc-debug.json` on each compaction.                                |

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

CI (`.github/workflows/ci.yml`) runs `just ci` (format check + typecheck +
tests) on every push and pull request.

## Releasing

Releases are **tag-driven** — the git tag is the source of truth for the version.

1. Push an annotated tag matching `vX.Y.Z` (or a prerelease like `vX.Y.Z-rc.1`):

   ```
   git tag v0.2.0
   git push origin v0.2.0
   ```

2. `.github/workflows/release.yml` then:
   - re-runs the full CI gate,
   - sets `package.json` version from the tag,
   - publishes to npm (`latest` for releases, `next` for prereleases) with
     provenance, **tokenlessly via OIDC trusted publishing**,
   - creates a GitHub Release with auto-generated notes.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
(OIDC) — no `NPM_TOKEN` secret is stored. The `opencode-vcc` package must exist
on npm (the first publish is done manually) and have a trusted publisher
configured for this repo's `release.yml` workflow. You do **not** commit a
version bump — the workflow derives it from the tag.

## License

MIT
