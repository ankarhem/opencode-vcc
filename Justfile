# opencode-vcc development tasks
# AGENTS.md: "Always run `just validate` before committing."

# Full validation gate (local): auto-format + typecheck + tests.
validate: fmt typecheck test
    @echo "✓ validate: all green"

# CI validation gate: format-CHECK (fails on drift) + typecheck + tests.
ci: fmt-check typecheck test
    @echo "✓ ci: all green"

# Format all files via the flake's treefmt config (prettier + nixfmt).
fmt:
    nix fmt

# Fail if any file is not formatted (for CI). Runs the formatter, then errors on drift.
fmt-check:
    nix fmt
    git diff --exit-code

typecheck:
    bun run typecheck

test:
    bun test

install:
    bun install
