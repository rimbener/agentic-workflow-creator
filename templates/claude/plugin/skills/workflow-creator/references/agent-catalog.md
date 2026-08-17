# Agent catalog

The bundled agents in `assets/agents/` are **base templates for creating the
real agents**. For each agent the workflow needs, instantiate a copy into the
package's `agents/` folder, tailored to this workflow:

- **Keep only the modes the workflow's nodes invoke.** A build loop that
  never runs `kill-mutants` ships an implementer without that mode row.
- **Strip checks on artifacts no node produces.** A workflow without mutation
  testing gets a `dod_validator` that has never heard of `mutation.md`; one
  without slice reviews gets a validator that doesn't demand
  `review-slice-N.md` files. The agent validates what *this* workflow needs.
- **Change nothing else.** The design rules hold in every copy: project-
  agnostic, phase-unaware, isolated, argument-driven, one return line. Never
  add repo facts, another agent's name, or workflow-phase knowledge while
  trimming.

`workflow_lead.md` is the exception: it is pure coordination with nothing
workflow-specific to trim, so every package copies it unchanged. When no
bundled agent fits a step, author a new one — see "Authoring a new agent" at
the end.

Every agent writes its artifacts under `.awc/tasks/<task>/` and returns one
line, usually `signal -> <report file>`. Arguments arrive in the invocation
prompt and are never guessed — a missing required argument makes the agent
return `blocked` (or its own failure verdict). The workflow YAML's `prompt:`
lines are where those arguments get passed.

## The agents

| Agent | Does | Invocation arguments | Return signals |
| --- | --- | --- | --- |
| `workflow_lead` | Runs the workflow: invokes agents, enforces gates and caps, escalates on halt. Coordination only — never writes or commits | `Task/Mode/Workflow` (supplied by the launch command) | `complete`, `halted`, `blocked` |
| `story_partner` | Interviews the human one question at a time → `user-story.md`. Owns the *problem*, never the solution | `Task`, `Mode: interview`, the raw request, `{{answer}}` | `user_story`; token `USER_STORY_WRITTEN` |
| `spec_partner` | Interview → spec bundle (`spec.md`, `acceptance-criteria.md`, `subtasks.md`, `subtask-N.md`) with vertical slices | `Task`, `Mode: write-bundle \| fix-spec-findings \| present-for-approval`, `Format: plain\|gherkin` | `spec_drafted` (token `SPEC_BUNDLE_WRITTEN`), `findings_resolved`, token `SPEC_APPROVED`, `blocked` |
| `spec_reviewer` | One-round automated review of the spec bundle → `review-spec.md`, before the human approval | `Task`, `Mode: review` | `APPROVED`, `CHANGES_REQUESTED` |
| `implementer` | Production code only, non-TDD. Never touches tests; test findings are tagged `test-step` and left open | `Task`, `Mode: build-slice \| fix-slice-findings \| fix-review-findings \| kill-mutants \| close-dod-gaps`, `Commands:`, `Slice: <N>` on slice modes | `green`, `blocked`; token `DONE` per mode |
| `unit_test_writer` | Unit tests only. Never touches production code; defects a test exposes stay recorded as open production rows | `Task`, `Mode: cover-criteria \| cover-gaps`, `Commands:`, `Slice: <N>`, `Report:` on `cover-gaps` | `covered`, `blocked`; token `DONE` on `cover-gaps` only |
| `implementer_tdd` | Strict TDD, self-contained: writes both tests and code. Same modes as `implementer` | `Task`, `Mode`, `Commands:`, `Slice: <N>` | `green`, `blocked`; token `DONE` per mode |
| `reviewer_slice` | Quick per-slice review, scoped to the slice's diff. Runs the suite itself → `review-slice-<N>.md` | `Task`, `Mode: review-slice`, `Slice: <N>`, `Commands:` | `APPROVED`, `CHANGES_REQUESTED` |
| `reviewer_engineering` | The exhaustive review: code, architecture & dependencies, performance, security, in one pass over the diff. Never runs CI itself | `Task`, `Mode: full-review \| delta-review`, `Base: <ref>` | `APPROVED`, `CHANGES_REQUESTED` |
| `mutation_tester` | Reads the mutation tool's captured log → `mutation.md`. Measures only; escalate-only, never edits | `Task`, `Mode: report`, `Log: <path>` | `PASS`, `SURVIVORS`, `NO_CHANGED_SOURCE`, `FAILED` |
| `dod_validator` | Re-runs the full Definition of Done checklist → `dod.md`. Validates only | `Task`, `Mode: validate`, `Commands:`, `Base: <ref>` | `PASS`, `DOD_FAILED` |

## Pairing rules

- **Non-TDD split**: `implementer` (production code) + `unit_test_writer`
  (tests) are independent — neither references or waits on the other's
  internals; the workflow's step order is the only coupling.
- **TDD**: `implementer_tdd` replaces the pair — it owns both sides. Don't put
  `unit_test_writer` in its slice loop.
- **`test-step` routing**: gates that write findings files (`reviewer_slice`,
  `dod_validator`, `implementer` in `kill-mutants`) tag test-side rows
  `test-step`. Route those to `unit_test_writer` `cover-gaps` with
  `Report: <that file>`; untagged rows are the implementer's. In the split
  pairing, a findings loop therefore usually holds *both* fix steps.
- **`reviewer_engineering` never runs CI** — sandwich it: a `run:` CI step
  before it (so it reviews a verified tree) and another after the fix step
  (so no round ends on an unverified tree).
- **Loop-ending tokens**: only the last agent step's `<promise>DONE</promise>`
  ends a loop (see `running.md`), so order fix steps so the agent whose
  completion criterion matches the loop's meaning runs **last** — e.g.
  `implementer` `fix-slice-findings` (DONE = all slices built) closes the
  slice loop, after `cover-gaps` has run.
- **Mutation loops end on `until_run:`**, never on a sentinel — the gate
  script reads the tool's own log, so no agent can end the loop by asserting.
- **Commits always belong to an agent.** The lead may never commit, and a
  `run: git commit` node would ask exactly that. Fix-mode agents already
  commit their own work; a commit with no such owner (the approved spec, a
  trailing artifact sweep) gets a small authored committer agent that stages
  only the paths named in its invocation.

## Canonical loop shapes

Single human sign-off of an artifact (`until: SPEC_APPROVED`, cap ~10):

1. `spec_partner` — `Mode: present-for-approval. Format: {{format}}. The human's response: {{answer}}` — `expect: SPEC_APPROVED`

   Presenting and edit turns end as approval requests the lead relays to the
   human; only the turn after an explicit approval carries the
   `<promise>SPEC_APPROVED</promise>` token. That closing turn returns a
   summary, never a signal line — it satisfies `expect:` through the token
   rule in `running.md` (a return ending with a `<promise>` token naming an
   `expect:` entry passes). This is the idiom for any approval loop: one
   token as both the loop's `until:` and the step's `expect:`.

Slice build, split pairing (`until: DONE`, last step's token = all slices done):

1. `implementer` — `Mode: build-slice. Slice: {{iteration}}. Commands: {{commands}}.`
2. `unit_test_writer` — `Mode: cover-criteria. Slice: {{iteration}}. Commands: {{test_command}}.`
3. `run:` the slice check (typecheck/lint + tests, failure-only output)
4. `reviewer_slice` — `Mode: review-slice. Slice: {{iteration}}. Commands: {{test_command}}.`
5. `unit_test_writer` — `Mode: cover-gaps. Report: review-slice-{{iteration}}.md. Commands: {{test_command}}.`
6. `implementer` — `Mode: fix-slice-findings. Slice: {{iteration}}. Commands: {{commands}}.`

Exhaustive review round (`until: DONE`, cap ~2):

1. `run:` CI
2. `reviewer_engineering` — `Mode: full-review. Base: {{base}}.`
3. `unit_test_writer` — `Mode: cover-gaps. Report: review.md. Commands: {{test_command}}.`
4. `implementer` — `Mode: fix-review-findings. Commands: {{commands}}.`
5. `run:` CI again — never end a round on an unverified tree

Mutation round (`until_run:` a gate script reading the tool's log, cap ~4):

1. `run:` the mutation tool scoped to the task's changed files, log captured
2. `mutation_tester` — `Mode: report. Log: <log path>.`
3. `implementer` — `Mode: kill-mutants. Commands: {{commands}}.`
4. `unit_test_writer` — `Mode: cover-gaps. Report: mutation.md. Commands: {{test_command}}.`
5. `run:` CI — mutation tools refuse to start on a red suite

DoD settle (`until: DONE`, cap ~2):

1. `dod_validator` — `Mode: validate. Commands: {{commands}}. Base: {{base}}.`
2. `unit_test_writer` — `Mode: cover-gaps. Report: dod.md. Commands: {{test_command}}.`
3. `implementer` — `Mode: close-dod-gaps. Commands: {{commands}}.`

Trim steps the interview ruled out (no split pairing → drop the
`unit_test_writer` steps; TDD → replace both builders with `implementer_tdd`).

## Authoring a new agent

When a step needs an agent the catalog lacks (an e2e runner, a docs writer, a
release-notes drafter…), write it to the package's `agents/` folder following
the same design rules the bundled ones obey:

1. **Project-agnostic and concise** — no repo-specific commands, paths, or
   dependency lists baked in; keep the prompt short.
2. **No `model:` in frontmatter** — projects pick their own models.
3. **Phase-unaware** — the agent never mentions the pipeline or other phases;
   it does its task when called.
4. **Isolated** — never name another agent; say "the workflow routes findings
   onward", not "reviewer_slice will check this".
5. **Arguments, never guesses** — everything the agent needs (commands to run,
   report paths, refs, formats) arrives in the invocation; a missing required
   argument returns `blocked`, naming it.
6. **One return line** — `signal -> <report file>`, artifacts under
   `.awc/tasks/<task>/`, never pasted into chat. Loop-enders append
   `<promise>DONE</promise>` only when their documented condition holds.
7. **A blocked command is `blocked`** — never "verified by inspection".
