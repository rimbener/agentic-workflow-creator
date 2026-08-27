# Progress history

## 2026-08-15 — `fc5f51e` — feat(agents): add workflow agent prompt templates

Added 11 agent prompt templates under `templates/agents/` (workflow lead, spec/story partners, implementers, testers, reviewers).

## 2026-08-17 — `dc66d36` — feat(skill): build out workflow-creator plugin content

Fleshed out the bundled plugin: SKILL.md's recon → interview → design → write → validate process, prompt.md, references/interview.md and agent-catalog.md, and assets/running.md. Moved the agent base templates from `templates/agents/` into the skill's own `assets/agents/`, and escaped `$ARGUMENTS` in SKILL.md so the harness's placeholder substitution doesn't mangle the prose explaining it. Extended `staging.test.ts` to cover the new paths and cross-check the agent catalog against the actual templates.

## 2026-08-17 — `58299c3` — test(evals): add workflow-creator eval fixtures and fact-checker

Added tiny target repos (`bun-app`, `docs-site`), `evals/evals.json` (prompts + grading expectations), and `scripts/check_package.ts`, which extracts objective facts from a generated workflow package for graders.

## 2026-08-17 — `ef698b0` — chore: set bun test root and ignore generated workflow examples

Pointed `bun test` at `test/` explicitly and stopped tracking generated contents of `workflows-examples/`.

## 2026-08-17 — `3884b80` — docs: document local dev workflow and updated plugin layout

Added a README section on using `awc` from this checkout via `npm link` (or by path, or an `npm pack` rehearsal) without publishing. Updated SPEC.md's file tree to match the workflow-creator skill's references/assets restructuring.

## 2026-08-17 — `048ff2f` — chore(agents): add repo-tailored /commit command

Added the Conventional Commits `/commit` command, adapted from the generic monorepo version to this repo's single-package layout.

## 2026-08-17 — `5e03fdf` — chore: add AGENTS.md and wire up Claude Code compatibility symlinks

Added the repo guidance as AGENTS.md, with CLAUDE.md symlinked to it, and symlinked `.claude/commands` to `.agents/commands` so Claude Code reads the same repo-tailored `/commit` command from one source of truth.

## 2026-08-17 — `2bd0a57` — feat(cli): add Codex and opencode hosts

Split the payload into `templates/shared` plus per-host staging. Codex and opencode get a shadowed config dir so the session loads the skill without writing into the user's real home. Generated packages now ship a launcher for each host. Smoke checks every installed binary actually loads it.

## 2026-08-17 — `2dea88c` — test(evals): require a launcher per host

Generated packages now ship Claude, Codex, and opencode launchers. The fact-checker reports all three so graders can check they agree.

## 2026-08-17 — `f6f2059` — docs: document multi-host staging and generated launchers

SPEC and README now cover the three hosts, the shadow config dir, and the per-host launchers a generated package ships. AGENTS.md matches.

## 2026-08-18 — `b16be48` — feat(skill): launch worktree runs from a script inside the tree

Worktree isolation is a launcher concern. Generated packages ship `./<name>.sh` plus `hosts.conf`; the script creates or reuses a worktree from HEAD and starts the host already in that checkout. YAML no longer creates the tree.

## 2026-08-18 — `8013d22` — feat(cli): drive the agent roster from hosts.conf

CLI help, smoke, and host-name tests read the same tab-separated roster the launch script copies.

## 2026-08-18 — `5e10a75` — test(evals): expect a worktree launch script, not a YAML node

Graders look for a root launch script plus `hosts.conf`; in-place workflows omit both.

## 2026-08-18 — `aef0bb2` — docs: document worktree launch script and hosts.conf

AGENTS, README, and SPEC cover the launch script, the `hosts.conf` roster, and `RUNNERS`.

## 2026-08-21 — `3b9ef0a` — feat(skill): ship grill-me and grilling in the shared payload

Bundled grill-me and grilling into the shared payload so awc sessions load them next to workflow-creator. Staging tests assert they land for every host.

## 2026-08-21 — `11cbd2a` — feat(skill): prompt for launch name and prefix

Worktree script asks for name and branch prefix on a TTY instead of FILL slots. Roster file is `agents-cli.conf`.

## 2026-08-21 — `d54f785` — test(evals): expect agents-cli.conf beside the launch script

Graders look for a root `agents-cli.conf` next to the launch script.

## 2026-08-21 — `df7a13f` — docs: document launch prompts and agents-cli.conf

AGENTS and README cover the TTY prompt, `AWC_NAME` / `AWC_BRANCH_PREFIX`, and the renamed roster.

## 2026-08-24 — `eba7f56` — feat(skill): add parallel nodes and wait joins to the YAML dialect

`parallel: true` starts a run/agent and the lead keeps walking. `wait:` collects in-flight results; leftover work drains at the end of the list.

## 2026-08-24 — `2dc99c5` — test(evals): recognize wait and parallel: true in package facts

check_package treats `wait:` as a behavior and records `parallel`; graders allow wait in yaml-valid-simple-nodes.

## 2026-08-24 — `1a9b489` — docs: mention parallel: true and wait: in the dialect list

AGENTS.md's node-type bullet now matches running.md.

## 2026-08-26 — `67176c2` — feat(skill): scope a node's agent with allowed_tools

`allowed_tools:` lists host-neutral capabilities (read, search, edit, shell, web, spawn) that the lead maps to its host's tools and states in the spawned prompt; no host's spawn tool takes an allowlist, so the mapping table ships in running.md.

## 2026-08-26 — `7673ab3` — test(evals): record allowed_tools in package facts

check_package captures `allowed_tools` on nodes and loop steps; graders treat it as a modifier, not a second behavior.

## 2026-08-26 — `78b8956` — docs: mention allowed_tools in the dialect list

AGENTS.md's node-type bullet now matches running.md and says why the key names capabilities.

## 2026-08-27 — `7c448e9` — feat(agents): spec a balanced approach, refactoring included

spec_partner weighs the narrow change against the proper one and specifies the balance — the smallest change that still lands on good practice — with a needed refactor in the spec and in the slice that needs it. spec_reviewer flags both the workaround and the overreach; the implementers carry out a reshaping the subtask names.

## 2026-08-27 — `7c1cb52` — feat(skill): add capture modes so a ready-made problem still writes a story

A spec step always opens from `user-story.md`, so a `story_partner` node precedes it. `interview`, `capture`, and `capture-and-confirm` are the dial for how that file gets written; leftover capture questions hand off to the spec interview under `## Open questions`.

## 2026-08-27 — `abb1b8d` — test(evals): cover capture and confirm story paths

`ticket-capture-story` and `thin-ticket-confirm` grade the lean story modes. `check_package` reports each story step with its loop context so a tokenless capture inside a token-closed loop is visible.

## 2026-08-27 — `ed77630` — feat(skill): archive the task trail with a finish node

The task trail is two-tiered while a run is live: `spec.md` and `acceptance-criteria.md`, the pair a human approves, sit at `.awc/tasks/in-progress/<task>/`'s root, and every other artifact lives in `tmp/` beside them. Every bundled agent names the two-tier paths; the lead learns that a `run:` node's command is the workflow acting, not a write. A workflow that writes the trail closes it with a node running `scripts/finish-task.sh` (copied verbatim from `assets/finish-task.sh`), which moves the whole directory — `tmp/` and all — to `.awc/tasks/done/<task>/` without touching git. `finish-task.test.ts` drives the script itself: the move, resume no-op, sibling isolation, kebab-case guard, and the unstaged archive; `staging.test.ts` forbids the old flat path.

## 2026-08-27 — `34254d6` — feat(evals): expect the two-tier task trail and finish node

Every workflow eval gains a task-trail expectation: agents write under `.awc/tasks/in-progress/<task>/` with the approved pair at the root and the rest in `tmp/`, and a `run:` node invoking `scripts/finish-task.sh` is the last node that touches the trail. The mutation eval also grades that the archive move is committed by an authored committer agent, never a `run: git commit` or the lead. `check_package` extracts `finishTaskScripts` resolved against the finish node's actual run path and a `trail_flat` string list instead of a boolean.
