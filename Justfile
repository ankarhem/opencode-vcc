# opencode-vcc development tasks
# AGENTS.md: "Always run `just validate` before committing."

# Full validation gate: format (via nix fmt) + typecheck + tests.
validate: fmt typecheck test
    @echo "✓ validate: all green"

# Format all files via the flake's treefmt config (prettier + nixfmt).
fmt:
    nix fmt

typecheck:
    bun run typecheck

test:
    bun test

install:
    bun install
