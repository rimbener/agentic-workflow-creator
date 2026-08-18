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

## 2026-08-18 — `b16be48` — feat(skill): launch worktree runs from a script inside the tree

Worktree isolation is a launcher concern. Generated packages ship `./<name>.sh` plus `hosts.conf`; the script creates or reuses a worktree from HEAD and starts the host already in that checkout. YAML no longer creates the tree.

## 2026-08-18 — `8013d22` — feat(cli): drive the agent roster from hosts.conf

CLI help, smoke, and host-name tests read the same tab-separated roster the launch script copies.

## 2026-08-18 — `5e10a75` — test(evals): expect a worktree launch script, not a YAML node

Graders look for a root launch script plus `hosts.conf`; in-place workflows omit both.

## 2026-08-18 — docs: document worktree launch script and hosts.conf

AGENTS, README, and SPEC cover the launch script, the `hosts.conf` roster, and `RUNNERS`.

## 2026-08-17 — `f6f2059` — docs: document multi-host staging and generated launchers

SPEC and README now cover the three hosts, the shadow config dir, and the per-host launchers a generated package ships. AGENTS.md matches.
