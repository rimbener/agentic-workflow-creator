# AGENTS.md

This file provides guidance to LLMs when working with code in this repository.
In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision. ALWAYS use ASD-STE100 (Simplified Technical English) for explanations, documentation, etc.

## What this repo is

`awc` (agentic-workflow-creator) is a Node CLI that launches a coding agent —
Claude Code, Codex, or opencode — pre-loaded with a bundled skill and command
for a single session, without touching the user's global agent config or the
target project's config directory. It stages `templates/` into a temp folder,
spawns the agent pointed at it, and deletes the folder on exit. See `SPEC.md`
for the full design rationale.

The bundled payload's centerpiece is the **workflow-creator** skill: it
interviews a user and generates a "lead-run agentic workflow package" — a
YAML of tiny nodes executed step by step by a `workflow_lead` subagent, plus
the agent files and scripts those nodes invoke. Two sibling skills change a
package that already exists in the user's repo, and they are deliberately
separate so each can grow on its own: **workflow-upgrader**
(`awc <agent> --upgrade`) brings a package up to date with the current
dialect — it asks only which package, audits it against the creator's
validation checklist, and lands the migrations, never a change to what the
workflow does — and **workflow-editor** (`awc <agent> --edit`) applies changes
the user has already decided — exactly those, without the broader ceremony.
The two never ship in the same session.

There are two largely independent things to reason about:

1. **The `awc` CLI itself** — `src/`, plain Node/TypeScript.
2. **The bundled skill content** — `templates/`, which is prose/Markdown/YAML
   consumed by a *different* agent session (the one `awc` launches), not by
   this repo's build.

## Commands

```bash
bun install         # install deps
bun run build        # bundle src/cli.ts -> dist/cli.js (bun build --target=node)
bun run typecheck     # tsc --noEmit
bun test              # run all unit tests (test/*.test.ts)
bun test test/staging.test.ts   # run a single test file
bun run smoke         # scripts/smoke.sh — per installed agent: stage/spawn/cleanup cycle against the real binary, plus a check that the payload landed under that host's dir names
bun run check          # biome check
bun run format         # biome format --write
bun run lint           # biome lint
```

Bun is the dev toolchain only; the published output (`dist/cli.js`) must stay
100% Node-compatible (no `Bun.*` globals in `src/`). Formatting: single
quotes, no semicolons (ASI), 2-space indent (biome.json).

## Architecture — the CLI (`src/`)

Small, linear pipeline, one file per concern:

- `cli.ts` — entry point: parses argv, handles `--help`/`--version`, loads
  the host roster from `assets/agents-cli.conf`, dispatches through `RUNNERS`.
- `hosts.ts` — parses that roster (names, TUI argv, help, smoke paths).
- `args.ts` — `parseCli`: splits argv on the first `--` into "own" flags vs.
  `passthrough` args forwarded verbatim to the agent binary.
- `agents/run.ts` — `launch`: the spawn → signal → cleanup lifecycle every
  agent shares. Registers `SIGINT` as a no-op (the agent TUIs own Ctrl+C
  internally — the wrapper must survive it and only clean up when the child
  actually exits), `SIGTERM` → exit 143, and a synchronous
  `process.on('exit')` cleanup as the last-chance guard against a hard kill.
- `agents/{claude,codex,opencode}.ts` — one file per host: a `stage*` function
  (exported, so tests can drive it without spawning) and a `run*` that stages
  then calls `launch`.
- `mode.ts` — the one place that knows what `--upgrade` and `--edit` change:
  which skill directories the payload leaves out, and which initial prompt
  each host reads. Create stages no change skill (an unused skill is only an
  extra trigger competing for the model's attention); `--upgrade` adds the
  upgrader, `--edit` adds the editor — never both. The creator and the
  grill-me/grilling aids ship in every mode; both change skills read the
  dialect and the agent bases from `../workflow-creator/`, so the creator
  must be there beside them.
- `staging.ts` — `resetTmp`/`copyPayload`/`shadow`/`cleanup`/`readPrompt`.
  `resetTmp` always deletes a stale `tmpDir` first (self-heals after a
  `kill -9`, which cannot be intercepted by handlers). `shadow` is the piece
  that makes the env-var hosts work — read its comment before touching it.
- `paths.ts` — resolves `templatesDir()`/`sharedDir()`/`hostDir()`/
  `agentsCliConfPath()`/`packageJsonPath()` relative to the compiled entry file via
  `new URL(..., import.meta.url)`, **never** `process.cwd()` — this is what
  makes it work identically via `npx`, a global install, and
  `node dist/cli.js` run locally.

Adding another agent means a row in `assets/agents-cli.conf`, a file under
`src/agents/`, and `templates/hosts/<name>/prompt.md`, `prompt-upgrade.md`
and `prompt-edit.md`.

Codex is the odd one out for the payload's *command* half: it has no
slash-command slot (it dropped `$CODEX_HOME/prompts` in 0.117.0), so
`awc-status` ships there as a second skill via `copyCommandsAsSkills`. Do not
"restore" a `prompts/` dir — it is never read, and a file sitting in it passes
every on-disk check while doing nothing. `scripts/smoke.sh` guards this by
asserting each host actually *loads* the payload (`codex debug prompt-input`,
`opencode debug skill` + `debug config`), run from a scratch dir so this
repo's own AGENTS.md cannot satisfy the grep.

The three hosts are injected differently, and that asymmetry is the main thing
to keep straight (full table in `SPEC.md`): Claude Code takes a whole plugin
from `--plugin-dir`, while Codex (`CODEX_HOME`) and opencode
(`OPENCODE_CONFIG_DIR`) read one config directory that the env var *replaces*
rather than extends. Hence `shadow`: symlink every entry of the user's real
config dir into the temp dir, but make the skill/command dirs real folders
holding links to the user's entries plus our payload. Staging never writes
into the real config dir; the agent writing through a link (a refreshed token,
a new session file) lands where it should.

## Architecture — the bundled content (`templates/`)

```
templates/
├── shared/                          # host-neutral; staged into every host under its own dir names
│   ├── commands/awc-status.md       # /awc-status
│   ├── skills/{grill-me,grilling}/  # conversational aids — staged in every mode
│   ├── skills/workflow-creator/
│   │   ├── SKILL.md                 # the skill's process (recon → interview → design → write → validate)
│   │   ├── references/
│   │   │   ├── interview.md         # what to ask, one question per turn
│   │   │   ├── agent-catalog.md     # bundled base agents: args, return signals, pairing/loop rules
│   │   │   └── hosts.md             # in-session launchers + worktree launch script
│   │   └── assets/
│   │       ├── running.md           # the YAML dialect's execution contract — copied verbatim into every generated package
│   │       ├── run.sh               # worktree launch template — copied to ./<name>.sh; FILL is worktree parent
│   │       ├── finish-task.sh       # archives .awc/tasks/in-progress/<task>/ → done/; copied verbatim into a package
│   │       ├── workflow-rules.md    # the rules skill — copied verbatim as SKILL.md into each host's skill dir in the target repo
│   │       ├── agents-cli.conf      # host roster — add/remove a host only here
│   │       └── agents/*.md          # base agent templates instantiated (tailored) per generated workflow
│   ├── skills/workflow-upgrader/     # staged only under --upgrade
│   │   ├── SKILL.md                 # locate → inventory → audit → the few questions a migration forces → diff plan → apply → validate
│   │   └── references/
│   │       ├── inventory.md         # reading a package into a map, and the audit
│   │       ├── upgrade-playbook.md  # each migration, and what it ripples into
│   │       └── interview.md         # the upgrade conversation
│   └── skills/workflow-editor/       # staged only under --edit
│       ├── SKILL.md                 # locate → read silently → apply the stated changes + ripples → validate
│       └── references/
│           └── change-playbook.md   # one recipe per shape of change, with the ripples that get missed
└── hosts/
    ├── claude/{prompt.md, prompt-upgrade.md, prompt-edit.md, plugin/.claude-plugin/plugin.json}
    ├── codex/{prompt.md, prompt-upgrade.md, prompt-edit.md}
    └── opencode/{prompt.md, prompt-upgrade.md, prompt-edit.md}
```

Key things to know before touching this content:

- **Neither change skill owns a dialect of its own.** The upgrader and the
  editor both read `../workflow-creator/`'s `assets/running.md`,
  `references/*`, `SKILL.md` and `assets/agents/*.md` — every host stages
  skills as flat siblings, so that path resolves everywhere. The creator's
  validation checklist is what the upgrader's audit compares a package
  against (and what the editor validates a changed package with), which is
  why "bring an old package up to date" needs no version list and cannot rot.
  `test/staging.test.ts` checks every `../workflow-creator/<path>` either
  skill cites still resolves. Beyond that shared dialect, the two skills
  deliberately repeat rather than cross-reference each other — the upgrader
  grows its own functionality, and a `../workflow-upgrader/` path in the
  editor would dangle in every `--edit` session anyway.
- **No skill runs a package.** Running is the job of the launchers every
  package ships; a "use my workflow to build X" ask landing in an awc session
  is bounced to them — the change skills carry that hand-off, and
  `test/staging.test.ts` pins it.
- The bundled agents in `assets/agents/` are **base templates, never final
  artifacts**. The skill copies and tailors one per workflow into the
  generated package's `agents/`, trimming modes/checks the workflow doesn't
  use — except `workflow_lead.md`, which every package copies unchanged.
- `test/staging.test.ts` cross-checks `references/agent-catalog.md`'s agent
  table against `assets/agents/*.md` in both directions — adding or removing
  a bundled agent template requires updating the catalog table row, or the
  test fails. It also drives each host's `stage*` function directly, so a new
  host needs a case there.
- The generated YAML dialect (nodes: `run:`, `agent:`+`prompt:`, `inline:`,
  `loop:`, `gate:`, `when:`, `parallel: true`, `wait:`, `allowed_tools:`,
  `model:`, `effort:`) is
  fully specified in `assets/running.md` — read it before changing anything
  that touches how workflows are authored or executed. `allowed_tools:` names
  host-neutral capabilities (`read`, `search`, `edit`, `shell`, `web`,
  `spawn`), not host tool names: no host's spawn tool takes an allowlist, so
  the lead maps the capabilities and states the scope in the spawned prompt.
  The mapping table lives in `running.md` because that is the file the lead
  has at run time.
- `model:` and `effort:` work the same way one step further: no host's spawn
  tool takes an effort, and two of the three take no model, so a node names a
  **tier** and the package registers a **profile agent** per host —
  `.claude/agents/`, `.codex/agents/`, `.opencode/agent/`, each named
  `awc-<workflow>-<tier>-<effort>` — that carries the model and the effort and
  nothing else. `references/hosts.md` holds the three file templates, and the
  tier-to-model table lives only in those files plus the generated README, so
  there is nothing to drift. The keys are optional, so an old package stays
  valid and the upgrader needs no migration. A host that cannot load a profile
  runs the step at the session default with a warning, never a halt.
- `inline:` is the one node the lead does **not** spawn: it acts as the agent
  in its own session, so an interview is one conversation rather than a spawn
  per question, and the lead's no-write rule steps aside there. It carries
  `agent:`, `prompt:` and `expect:` only — `parallel: true`,
  `allowed_tools:`, `model:` and `effort:` would shape a spawn that never
  happens, and there is no `{{answer}}` to relay. The interviewers run there (`story_partner`'s asking
  modes, `spec_partner`'s `write-bundle`); `capture` and every approval loop
  stay spawned, each being one self-contained exchange.
- Every generated package ships **three** in-session launchers — `.claude/commands/`,
  `.codex/skills/`, `.opencode/command/` — specified in `references/hosts.md`.
  A worktree workflow also ships `./<name>.sh` from `assets/run.sh` and
  `./agents-cli.conf` from `assets/agents-cli.conf` (add/remove a host only there):
  the script creates (or reuses) the worktree and starts the host already
  inside it, so the YAML has no worktree node. The Claude Code and opencode ones substitute `$ARGUMENTS` 
  exactly once into a fenced block; prose in those files must never mention the 
  literal placeholder elsewhere, since the harness rewrites every occurrence before
  the model sees it (which is why `hosts.md` backslash-escapes it throughout).
  Codex has no project-level slash commands, so its launcher is a project
  skill triggered by its `description` instead.
- Every generated package also installs the **rules skill** —
  `assets/workflow-rules.md` copied verbatim as `SKILL.md` into
  `.claude/skills/awc-workflow-rules/`, `.codex/skills/awc-workflow-rules/`
  and `.opencode/skill/awc-workflow-rules/` in the target repo. It is what a
  later session finds when someone edits `workflows/<name>/` by hand with no
  awc skill loaded: the per-file rules, the ripples, the validation walk, the
  halted-run table, and the routing to `--edit` / `--upgrade`. Its `paths:`
  frontmatter makes Claude Code load it on its own for files under
  `workflows/` and for the three launcher paths; Codex and opencode ignore
  that key and select it by description (both verified to load a skill
  carrying it). It restates the dialect, so a change to `running.md` or the
  validation checklist lands in `workflow-rules.md` in the same commit —
  `test/staging.test.ts` cross-checks node types and capability names. The name is fixed
  so every package in a repo shares one copy per host, it is never tailored
  (the upgrader audits it by `diff`, like `running.md`), and its body spells
  the arguments placeholder out in words because Claude Code substitutes it
  inside skills too. `test/staging.test.ts` pins all of that.
- Generated packages must read positively — no "(no worktree)", "NOT TDD",
  or similar negation echoes of ruled-out alternatives; SKILL.md's
  validation checklist greps for this before handoff.

## Eval material

One workspace per authoring skill — the creator, the upgrader and the editor;
the conversational aids (grill-me, grilling) have none. No workspace is part
of the shipped package (nothing here is in `package.json`'s `files`), and all
follow the same rule: a script extracts **objective facts** and never judges
pass/fail — graders combine those facts with their own reading.

`workflow-creator-workspace/` — grading a package that gets *generated*:
- `fixtures/` — tiny target repos (tracked as plain files) that eval prompts
  point the workflow-creator skill at.
- `evals/evals.json` — eval prompts + expectations for grading generated
  workflow packages.
- `scripts/check_package.ts` — run via
  `bun workflow-creator-workspace/scripts/check_package.ts <repo-dir> <skill-running-md-path>`;
  extracts JSON facts about a generated package (node shapes, ref resolution,
  grep flags).

`workflow-upgrader-workspace/` — grading a *diff*, so its fixtures are repos that
already hold a package and its evals run under `awc <agent> --upgrade`:
- `fixtures/bun-app-shipped` — a current-dialect package; the baseline the
  change evals start from.
- `fixtures/bun-app-drifted` — the same repo with a package generated before
  several dialect changes, plus two hand-edits its owner made afterward. What
  makes it stale is whatever the creator's validation checklist currently
  demands, so it needs no version stamps and cannot rot.
- `evals/evals.json` — three prompts (bring a stale package up to date, a
  package that is already current is left byte-identical, an edit-shaped ask
  is handed to `awc <agent> --edit` with the audit still done). Every one
  carries `nothing-else-touched` and `package-still-valid`;
  `test/staging.test.ts` pins those two, the fixtures, and the keys that grade
  upgrade-only behavior.
- `scripts/check_upgrade.ts` — run via
  `bun workflow-upgrader-workspace/scripts/check_upgrade.ts <baseline-dir> <result-dir>`;
  reports which files the session added, removed and changed, which is what
  both "did the ripples land" and "was anything else touched" are read from. It
  compares two directories rather than reading git, so it works whether or not
  the run committed. Package validity is `check_package.ts`'s job — one script,
  one thing.

`workflow-editor-workspace/` — grading a *diff plus the session's conduct*,
so its evals run under `awc <agent> --edit`. The package-holding evals reuse
`../workflow-upgrader-workspace/fixtures/bun-app-shipped` (one canonical
shipped package; a copy here would rot):
- `fixtures/bun-app-bare` — the tiny bun app with no package at all, for the
  "nothing to edit → hand to the creator loaded beside you" eval.
- `evals/evals.json` — seven prompts: four applies (an input rename, a
  phase removal that must sweep its orphans, a mutation phase that must untrim
  two agent copies from their bases, and a pairing swap plus a new input
  threaded through all four launch paths — all without a plan gate,
  everything beyond the request gated, validation in full) and three
  hand-offs (no package → the creator loaded beside the editor; audit-shaped
  → `awc <agent> --upgrade`; run-shaped → the package's own launchers, the
  likeliest misclassification since `--edit` previously ran a package).
  `test/staging.test.ts` pins the fixtures and the edit-only keys.
- No script of its own: the touched/untouched reading comes from the upgrader
  workspace's `check_upgrade.ts` directory diff, package validity from the
  creator workspace's `check_package.ts`.

`workflows-examples/` holds example generated workflow output, for reference.

## Commit conventions

This repo uses Conventional Commits with no AI co-author attribution (see
`.agents/commands/commit.md`). Group commits by concern in dependency order:
CLI source+tests, then plugin/skill content, then eval material, then
tooling/config/docs. Keep a source change and its test in the same commit.

REMEMBER: In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision. ALWAYS use ASD-STE100 (Simplified Technical English) for explanations, documentation, etc.
