---
description: Commit staged/unstaged changes using Conventional Commits (no Claude co-author)
argument-hint: "[optional type/scope or message hint, e.g. 'fix(auth)' or 'bump deps']"
---

# Commit (Conventional Commits)

Commit the current changes following the [Conventional Commits](https://www.conventionalcommits.org/) spec. Optional hint: $ARGUMENTS

<critical>NEVER add a `Co-Authored-By: Claude` line (or any Claude/AI co-author/attribution) to the commit message or body.</critical>

## Steps

1. **Confirm the repo.** This is a single-package repo (agentic-workflow-creator): the `awc` CLI in `src/` with tests in `test/`, the bundled Claude plugin (workflow-creator skill, agent templates, commands) under `templates/claude/`, eval material under `workflow-creator-workspace/`, and docs at the root (`SPEC.md`, `README.md`) plus `progress/`. Run `git` from the repo root (`git rev-parse --show-toplevel`).

2. **Inspect.** Run `git status --short` and `git diff` (and `git diff --staged`) to understand every change. If nothing is changed, stop and report that.

3. **Group logically and order by dependency.** If the changes form one coherent unit, make a single commit. Otherwise split into multiple conventional commits — one per concern, never a catch-all — and commit them in an order where each commit stands on its own (builds/tests conceptually pass without the later ones):
   1. CLI source first (`src/`), with its tests
   2. then plugin/skill content (`templates/claude/**`)
   3. then eval material (`workflow-creator-workspace/**`)
   4. last: tooling/config/docs-only changes (root configs, `.gitignore`, `SPEC.md`, lockfiles not tied to a code commit)
   Keep a source change and its tests in the SAME commit. Generated files (e.g. `bun.lock`) go with the commit that caused them.

4. **Compose the message.** Format: `type(scope): subject`
   - **type** — one of: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert`. Infer it from the diff (new behavior → `feat`; bug fix → `fix`; tests only → `test`; deps/tooling → `chore`/`build`).
   - **scope** — the affected area (e.g. `cli`, `staging`, `skill`, `agents`, `plugin`, `evals`, `deps`). Omit if it spans many areas.
   - **subject** — imperative mood, lowercase, no trailing period, ≤ ~72 chars.
   - **body** (optional) — wrap at ~72 cols; explain *what* and *why*, not *how*. Add a footer line referencing the ticket if is present in the branch name or $ARGUMENTS.
   - **breaking changes** — if any, add `!` after type/scope and a `BREAKING CHANGE:` footer.
   - Honor $ARGUMENTS as a hint (e.g. a forced type/scope or a one-line summary), but still verify it fits the actual diff.

5. **Commit.** Stage the intended files (`git add <paths>` — avoid blanket `git add -A` if there are unrelated changes) and commit. Pass the message via repeated `-m` flags or a heredoc. **Do not** include any Claude/AI co-author or "Generated with" attribution.

6. **Report.** Show the resulting `git log -1 --stat` (short) and the branch. Do NOT push unless the user explicitly asks.

7. Add the commit to the progress history file in the progress folder: progress/history.md

## Example messages

- `feat(skill): add workflow-creator skill with lead-run YAML dialect`
- `fix(staging): stage skill assets into the plugin copy`
- `test(cli): cover positional arg parsing`
- `chore(deps): bump bun-types`
- `refactor(agents)!: drop the gherkin_* twin templates`
