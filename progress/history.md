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
