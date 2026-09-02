#!/usr/bin/env bash
set -euo pipefail

# Records one reviewer verdict as a one-line file beside the review it belongs
# to. Copied verbatim into a generated package as scripts/write-verdict-file.sh
# and run by the reviewer agents — the review trail keeps the findings prose;
# this file carries nothing but the word a `when:` guard greps, so a guard
# never depends on where in the review the verdict happens to sit.
#
#   write-verdict-file.sh <review-file> <verdict>
#
# <review-file> is the review trail's path (or bare name), with or without
# .md — the verdict file lands beside it, named after it:
#
#   review-spec                           → review-spec-verdict.md
#   .awc/tasks/.../tmp/review-slice-2.md  → .awc/tasks/.../tmp/review-slice-verdict-2.md
#
# A trailing -<N> stays last, so per-slice guards can glob
# review-slice-verdict-*.md. <verdict> is APPROVED or CHANGES_REQUESTED and
# nothing else is accepted — the file is always exactly one bare verdict word
# and nothing else. Silent on success; every failure prints and exits non-zero.

if [[ $# -ne 2 || -z "${1:-}" || -z "${2:-}" ]]; then
  echo "usage: $(basename "$0") <review-file> <verdict>" >&2
  exit 1
fi

verdict="$2"
if [[ ! "$verdict" =~ ^(APPROVED|CHANGES_REQUESTED)$ ]]; then
  echo "verdict must be APPROVED or CHANGES_REQUESTED: $verdict" >&2
  exit 1
fi

base="${1%.md}"

# Every path segment must be a plain name — no `..`, no empty, no absolute —
# so the verdict file lands inside the tree the run works in, never outside.
# Split in bash itself: a single-segment name carries no trailing newline, so
# a read-based split would silently skip the check.
if [[ "$base" == /* ]]; then
  echo "review file path must be relative: $base" >&2
  exit 1
fi
seg="$base"
while [[ -n "$seg" ]]; do
  if [[ "$seg" == */* ]]; then
    cur="${seg%%/*}"
    seg="${seg#*/}"
  else
    cur="$seg"
    seg=""
  fi
  if [[ ! "$cur" =~ ^[A-Za-z0-9._-]+$ || "$cur" == . || "$cur" == .. ]]; then
    echo "review file path segments must be letters, digits, dots, hyphens, or underscores: $base" >&2
    exit 1
  fi
done

dir="$(dirname "$base")"
name="$(basename "$base")"

if [[ "$name" =~ ^(.*)-([0-9]+)$ ]]; then
  out="$dir/${BASH_REMATCH[1]}-verdict-${BASH_REMATCH[2]}.md"
else
  out="$dir/$name-verdict.md"
fi

printf '%s\n' "$verdict" > "$out"
