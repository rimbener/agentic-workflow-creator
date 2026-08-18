#!/usr/bin/env bash
set -euo pipefail

# Instantiated per workflow. Replace the FILL values; leave the rest alone
# unless this workflow's inputs are not `task` + `request`.
# --- FILL ---
NAME="__NAME__"
BRANCH_PREFIX="__BRANCH_PREFIX__"
WORKTREE_PARENT="__WORKTREE_PARENT__"
# --- END FILL ---

# Host roster is hosts.conf next to this script (copy of assets/hosts.conf).
# Add or remove a host only there.
HERE=$(cd "$(dirname "$0")" && pwd)
HOSTS_CONF="$HERE/hosts.conf"
if [[ ! -f "$HOSTS_CONF" ]]; then
  echo "hosts.conf not found next to $(basename "$0")" >&2
  exit 1
fi

host_names() {
  awk -F'\t' '/^[ \t]*$/ { next } /^[ \t]*#/ { next } { print $1 }' "$HOSTS_CONF"
}

host_argv() {
  awk -F'\t' -v h="$1" '/^[ \t]*$/ { next } /^[ \t]*#/ { next } $1 == h { print $2; exit }' "$HOSTS_CONF"
}

# Same rules as src/hosts.ts parseHostsConf.
if ! awk -F'\t' '
  /^[ \t]*$/ { next }
  /^[ \t]*#/ { next }
  NF != 6 {
    printf "hosts.conf:%d: expected 6 tab-separated fields, got %d\n", NR, NF > "/dev/stderr"
    exit 1
  }
  {
    for (i = 1; i <= 6; i++) if ($i == "") {
      printf "hosts.conf:%d: empty field\n", NR > "/dev/stderr"
      exit 1
    }
    if (seen[$1]++) {
      printf "hosts.conf:%d: duplicate host %s\n", NR, $1 > "/dev/stderr"
      exit 1
    }
    n++
  }
  END { if (n == 0) { print "hosts.conf: no hosts" > "/dev/stderr"; exit 1 } }
' "$HOSTS_CONF"; then
  exit 1
fi

usage() {
  local names
  names=$(host_names | paste -sd '|' -)
  echo "usage: $(basename "$0") <task> <${names}> <request...>" >&2
  exit 2
}

[[ $# -ge 3 ]] || usage

TASK=$1
HOST=$2
shift 2
REQUEST=$*

if [[ ! "$TASK" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "task must be a kebab-case id (got: $TASK)" >&2
  exit 2
fi

argv=$(host_argv "$HOST")
if [[ -z "$argv" ]]; then
  echo "unknown agent: $HOST ($(host_names | paste -sd ', ' -))" >&2
  exit 2
fi
read -r -a cmd <<<"$argv"
if ! command -v "${cmd[0]}" >/dev/null 2>&1; then
  echo "not on PATH: ${cmd[0]}" >&2
  exit 127
fi

# Script lives at the repo root. Resolve the main checkout even when this
# copy is the one inside an existing worktree. pwd -P so /tmp vs /private/tmp
# (and other symlink spellings) compare as one path.
cd "$HERE"
git_common=$(git rev-parse --git-common-dir)
if [[ "$git_common" != /* ]]; then
  git_common="$(pwd)/$git_common"
fi
ROOT=$(cd "$(dirname "$git_common")" && pwd -P)
cd "$ROOT"

WORKTREE="$ROOT/$WORKTREE_PARENT/$TASK"
BRANCH="$BRANCH_PREFIX/$TASK"
PKG="workflows/${NAME}/${NAME}.yaml"

canon_dir() {
  (cd "$1" && pwd -P)
}

# A subdirectory of the main checkout shares git-common-dir; only a row in
# `git worktree list` is a linked worktree.
is_registered_worktree() {
  local want listed
  want=$(canon_dir "$1" 2>/dev/null) || return 1
  while IFS= read -r listed; do
    [[ -n "$listed" ]] || continue
    if [[ "$(canon_dir "$listed" 2>/dev/null)" == "$want" ]]; then
      return 0
    fi
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
  return 1
}

branch_checkout_path() {
  local current=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) current=${line#worktree } ;;
      "branch refs/heads/${BRANCH}")
        if [[ -d "$current" ]]; then
          canon_dir "$current"
        else
          printf '%s\n' "$current"
        fi
        return 0
        ;;
    esac
  done < <(git worktree list --porcelain)
  return 1
}

if is_registered_worktree "$WORKTREE"; then
  :
elif [[ -e "$WORKTREE" || -L "$WORKTREE" ]]; then
  echo "path exists but is not a linked worktree: $WORKTREE" >&2
  exit 1
else
  if ! git cat-file -e "HEAD:${PKG}" 2>/dev/null; then
    echo "${PKG} is not on the current branch. Commit the package before the first run." >&2
    exit 1
  fi
  existing=$(branch_checkout_path || true)
  if [[ -n "${existing:-}" ]]; then
    echo "branch ${BRANCH} is already checked out at ${existing}" >&2
    exit 1
  fi
  mkdir -p "$WORKTREE_PARENT"
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git worktree add "$WORKTREE" "$BRANCH"
  else
    git worktree add -b "$BRANCH" "$WORKTREE" HEAD
  fi
fi

cd "$WORKTREE"

PROMPT="You are the workflow lead for this run — coordination only.

The launch arguments, verbatim:
<args>
${TASK} ${REQUEST}
</args>

1. Read workflows/${NAME}/agents/workflow_lead.md — that is your role; follow it exactly.
2. Read workflows/${NAME}/running.md — the execution contract for the workflow file.
3. Fill the workflow's inputs from the args block: the first word is \`task\` (the kebab id); everything after it is \`request\`. A missing required input is \`blocked\` — ask for it instead of running.
4. Run the workflow, top to bottom: Task: ${TASK}. Mode: run. Workflow: workflows/${NAME}/${NAME}.yaml."

exec "${cmd[@]}" "$PROMPT"
