#!/usr/bin/env bash
# Smoke test: for every installed agent, prove two things against the real binary.
#
#   1. Lifecycle — `awc <agent> -- --version` stages, spawns, and cleans up,
#      exiting 0 with no leftover temp dir. This also pins the assumption that
#      each CLI still short-circuits on --version with the initial prompt
#      already in argv (Codex takes the prompt as a positional, opencode via
#      --prompt), which is otherwise easy to break silently.
#   2. Payload — the same run under --keep leaves a staged tree that really
#      holds the workflow-creator skill and the awc-status command, as real
#      files, under the names that host looks for. --version never loads them,
#      so the lifecycle check alone cannot see a payload in the wrong place.
set -uo pipefail

cd "$(dirname "$0")/.."
PWD_ABS="$PWD"
TMP=".awc-smoke-tmp"
fail=0
trap 'rm -rf "$TMP"' EXIT

# Read the roster via the TypeScript parser (strict). FD 3 so inner commands
# cannot steal remaining rows from stdin.
while IFS=$'\t' read -r agent staged skillpath statuspath <&3 || [ -n "${agent:-}" ]; do
  [[ -z "${agent:-}" ]] && continue

  if ! command -v "$agent" >/dev/null 2>&1; then
    echo "== $agent (not installed, skipped)"
    continue
  fi
  echo "== $agent"

  # 1. lifecycle
  rm -rf "$TMP"
  if ! node dist/cli.js "$agent" --tmp-dir "$TMP" -- --version; then
    echo "   FAIL: non-zero exit"
    fail=1
  fi
  if [ -e "$TMP" ]; then
    echo "   FAIL: $TMP survived a run without --keep"
    fail=1
  fi

  # 2. payload
  rm -rf "$TMP"
  node dist/cli.js "$agent" --keep --tmp-dir "$TMP" -- --version >/dev/null || true
  for want in "$staged/$skillpath" "$staged/$statuspath"; do
    if [ -f "$TMP/$want" ] && [ ! -L "$TMP/$want" ]; then
      echo "   ok: $want"
    else
      echo "   FAIL: missing or symlinked — $want"
      fail=1
    fi
  done

  # 3. the host really loads it. File-on-disk checks cannot see a payload sitting
  # in a slot the agent stopped reading, which is exactly how the Codex
  # prompts/ regression hid. These listings are offline — no model call.
  #
  # Run them from an empty scratch dir, never the repo: this project's own
  # AGENTS.md names the payload files, and an agent that injects it would make
  # the greps below pass no matter where the payload landed.
  #
  # Patterns are anchored to each listing's own shape rather than bare
  # substrings, so an unrelated mention in a skill body cannot satisfy them.
  scratch=$(mktemp -d)
  probe=''
  case "$agent" in
    codex)
      # Both ship as skills here, and prompt-input is what the model actually
      # sees. Skills render as "- <name>: <description> (<path>)".
      probe='codex debug prompt-input'
      loaded=$(cd "$scratch" && CODEX_HOME="$PWD_ABS/$TMP/codex-home" \
        codex debug prompt-input 2>/dev/null)
      want_skill='- workflow-creator:'
      want_status='- awc-status:'
      ;;
    opencode)
      # The skill and the command live in different registries, so check both:
      # skills as {"name": "<name>"}, commands as a "<name>": { key.
      probe='opencode debug skill + debug config'
      cfg="$PWD_ABS/$TMP/opencode-config"
      loaded=$(cd "$scratch" && OPENCODE_CONFIG_DIR="$cfg" opencode debug skill 2>/dev/null
               cd "$scratch" && OPENCODE_CONFIG_DIR="$cfg" opencode debug config 2>/dev/null)
      want_skill='"name": "workflow-creator"'
      want_status='"awc-status": {'
      ;;
  esac
  rm -rf "$scratch"

  if [ -z "$probe" ]; then
    # Claude Code ships no offline listing. Say so out loud — a silent skip here
    # is the same shape of false green this whole step exists to catch.
    echo "   note: no offline load check for $agent (--plugin-dir is its own contract)"
  elif [ -z "$loaded" ]; then
    # Fail closed: an empty listing means the probe broke, not that all is well.
    echo "   FAIL: '$probe' produced no output — cannot confirm the payload loads"
    fail=1
  else
    for want in "$want_skill" "$want_status"; do
      if grep -qF -- "$want" <<<"$loaded"; then
        echo "   ok: $agent loads ${want}"
      else
        echo "   FAIL: $agent listing has no ${want}"
        fail=1
      fi
    done
  fi
  rm -rf "$TMP"
done 3< <(bun -e 'import { loadHosts } from "./src/hosts.ts"
for (const h of loadHosts()) {
  console.log([h.name, h.smokeDir, h.smokeSkill, h.smokeStatus].join("\t"))
}
')

[ "$fail" -eq 0 ] && echo "smoke: all checks passed"
exit $fail
