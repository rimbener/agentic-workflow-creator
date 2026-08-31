#!/usr/bin/env bash
set -uo pipefail

# The project's verification gate: typecheck, then the test suite. Silent when
# green; a failure prints that tool's own output and exits non-zero, so a green
# run costs the lead nothing and a red one quotes itself.

out=$(bun run typecheck 2>&1) || { echo "$out"; exit 1; }
out=$(bun test 2>&1) || { echo "$out"; exit 1; }
