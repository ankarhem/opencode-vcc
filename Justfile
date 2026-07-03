# opencode-vcc development tasks
# AGENTS.md: "Always run `just validate` before committing."

# Full validation gate: typecheck + tests + format check.
validate: typecheck test format-check
    @echo "✓ validate: all green"

typecheck:
    bun run typecheck

test:
    bun test

format:
    bun run format

format-check:
    bun run format:check

install:
    bun install
