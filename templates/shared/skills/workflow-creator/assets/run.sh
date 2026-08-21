#!/usr/bin/env bash
set -euo pipefail

# Instantiated per workflow. Replace the FILL value; leave the rest alone
# unless this workflow's inputs are not `task` + `request`.
# Workflow name and branch prefix are asked at launch (defaults: this
# script's basename, `task`).
# --- FILL ---
WORKTREE_PARENT="__WORKTREE_PARENT__"
# --- END FILL ---

# Host roster is agents-cli.conf next to this script (copy of assets/agents-cli.conf).
# Add or remove a host only there.
HERE=$(cd "$(dirname "$0")" && pwd)
AGENTS_CLI_CONF="$HERE/agents-cli.conf"
if [[ ! -f "$AGENTS_CLI_CONF" ]]; then
  echo "agents-cli.conf not found next to $(basename "$0")" >&2
  exit 1
fi

host_names() {
  awk -F'\t' '/^[ \t]*$/ { next } /^[ \t]*#/ { next } { print $1 }' "$AGENTS_CLI_CONF"
}

host_argv() {
  awk -F'\t' -v h="$1" '/^[ \t]*$/ { next } /^[ \t]*#/ { next } $1 == h { print $2; exit }' "$AGENTS_CLI_CONF"
}

# Same rules as src/hosts.ts parseHostsConf.
if ! awk -F'\t' '
  /^[ \t]*$/ { next }
  /^[ \t]*#/ { next }
  NF != 6 {
    printf "agents-cli.conf:%d: expected 6 tab-separated fields, got %d\n", NR, NF > "/dev/stderr"
    exit 1
  }
  {
    for (i = 1; i <= 6; i++) if ($i == "") {
      printf "agents-cli.conf:%d: empty field\n", NR > "/dev/stderr"
      exit 1
    }
    if (seen[$1]++) {
      printf "agents-cli.conf:%d: duplicate host %s\n", NR, $1 > "/dev/stderr"
      exit 1
    }
    n++
  }
  END { if (n == 0) { print "agents-cli.conf: no hosts" > "/dev/stderr"; exit 1 } }
' "$AGENTS_CLI_CONF"; then
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

# Never read stdin here — it belongs to the host (./demo.sh ... < commands.txt).
# Prompt + answer on /dev/tty (not read -p / stderr). Headless: defaults, or
# AWC_NAME / AWC_BRANCH_PREFIX. Skip when no fd is a TTY so tests don't hang.
ask() {
  local _var=$1 _prompt=$2 _default=$3 _val=$4
  if [[ -z "$_val" && -c /dev/tty && ( -t 0 || -t 1 || -t 2 ) ]]; then
    printf '%s [%s]: ' "$_prompt" "$_default" >/dev/tty || true
    read -r _val </dev/tty || true
  fi
  printf -v "$_var" '%s' "${_val:-$_default}"
}

default_name=$(basename "$0" .sh)
ask NAME "Workflow name" "$default_name" "${AWC_NAME-}"
ask BRANCH_PREFIX "Branch prefix" "task" "${AWC_BRANCH_PREFIX-}"

if [[ ! "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "workflow name must be a kebab-case id (got: $NAME)" >&2
  exit 2
fi
if [[ ! "$BRANCH_PREFIX" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "branch prefix must be a kebab-case id (got: $BRANCH_PREFIX)" >&2
  exit 2
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
    echo "${PKG} is not on the current branch." >&2
    known=$(git ls-tree -r --name-only HEAD -- workflows 2>/dev/null || true)
    if [[ -n "$known" ]]; then
      names=$(printf '%s\n' "$known" | sed -n 's|^workflows/\([^/]*\)/\1\.yaml$|\1|p' | sort | paste -sd ',' - | sed 's/,/, /g')
      echo "Re-run with AWC_NAME=<name> matching workflows/<name>/<name>.yaml${names:+ (known: ${names})}." >&2
    else
      echo "Commit the package before the first run." >&2
    fi
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

if [[ ! -f "$PKG" ]]; then
  echo "no package ${PKG} in ${WORKTREE}" >&2
  exit 1
fi

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
