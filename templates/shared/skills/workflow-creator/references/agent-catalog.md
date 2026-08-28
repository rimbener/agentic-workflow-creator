# Agent catalog

The bundled agents in `assets/agents/` are **base templates for creating the
real agents** — offered, never required: a workflow may use any number of
them, agents authored from scratch, or no agents at all. For each bundled
agent the workflow uses, instantiate a copy into the package's `agents/`
folder, tailored to this workflow:

- **Keep only the modes the workflow's nodes invoke.** A build loop that
  never runs `kill-mutants` ships an implementer without that mode row.
- **Trim a mode by name, not by section.** A mode's rules sit wherever they
  apply, so the base templates mark each rule with the mode it belongs to: the
  mode in backticks, the word **interviewing** for the two that ask
  (`interview` and `capture-and-confirm`), or the phrase **a capture mode** for
  the two that take a `Source:` (`capture` and `capture-and-confirm`).
  `story_partner` is where this bites, and there the marks are complete:
  - §The source and the two capture rows are marked for the capture modes.
  - Each mode row is marked with its own mode alone.
  - Protocol 1, the log paragraph and the question-turn ticks are marked
    *interviewing*; what `capture-and-confirm` adds to Protocol 1 is a bullet
    of its own.
  - Protocols 3, 4 and 5 and §Communication are each a mode-neutral opener
    over one marked bullet per mode.

  What every copy needs — the list of areas a story settles, the
  `user_story ->` return — sits above the marks and survives any trim, and no
  trim there has to cut inside a sentence. The trim itself is mechanical: drop
  the mode's row, then every marked block no surviving mode still claims,
  taking the sentences inside it whole. Dropping `capture` also drops that
  file's `## Open questions` material — only that mode ever writes the
  heading. Marks nest: inside a block you keep, a sentence or bullet
  marked for a mode you dropped goes with it. Text that carries no mark holds
  for every mode and stays. **The frontmatter is part of the trim**:
  `description:` names the modes in backticks, so rewrite it to the modes the
  copy actually has — a file that still advertises one no node invokes sends
  work to a mode it no longer carries. Renumber the protocol steps that
  survive, and check the cross-references (`§3`, `§The source`) still point
  where they did.
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
bundled agent fits a step — or the user prefers an agent of their own —
author a new one; see "Authoring a new agent" at the end.

Every agent writes its artifacts under the task's directory and returns one
line, usually `signal -> <report file>`. While a run is live that directory is
`.awc/tasks/in-progress/<task>/`: `spec.md` and `acceptance-criteria.md` — the
pair a human approves — sit at its root, and every other artifact lives in
`tmp/` beside them. A workflow that writes this trail ends by moving the whole
directory to `.awc/tasks/done/<task>/` (see "Finishing a run" below).
Arguments arrive in the invocation prompt and are never guessed — a missing required argument makes
the agent return `blocked` (or its own failure verdict). The workflow YAML's
`prompt:` lines are where those arguments get passed.

## The agents

| Agent | Does | Invocation arguments | Return signals |
| --- | --- | --- | --- |
| `workflow_lead` | Runs the workflow: invokes agents, enforces gates and caps, collects parallel work, escalates on halt. Coordination only — never writes or commits | `Task/Mode/Workflow` (supplied by the launch command) | `complete`, `halted`, `blocked` |
| `story_partner` | Writes `user-story.md` — the artifact the spec step reads. `interview` grills the human one question at a time, `capture` structures a source they already wrote, `capture-and-confirm` does both; the interviewing modes keep `story-interview-log.md` as their memory across turns. Owns the *problem*, never the solution | `Task`, `Mode: interview \| capture \| capture-and-confirm`, `Request:` (`interview`), `Source:` (capture modes), `{{answer}}` on the looping modes | `user_story`; token `USER_STORY_WRITTEN` on the looping modes; `blocked` when `Source:` cannot be read |
| `spec_partner` | Opens by reading `user-story.md` (`write-bundle` halts as `blocked` without it; the later modes read it when it is there). Interview (memory in `spec-interview-log.md`, `write-bundle` only) → spec bundle (`spec.md`, `acceptance-criteria.md`, `subtasks.md`, `subtask-N.md`) with vertical slices | `Task`, `Mode: write-bundle \| fix-spec-findings \| present-for-approval`, `Format: plain\|gherkin` | `spec_drafted` (token `SPEC_BUNDLE_WRITTEN`), `findings_resolved`, token `SPEC_APPROVED`, `blocked` |
| `spec_reviewer` | One-round automated review of the spec bundle → `review-spec.md`, before the human approval | `Task`, `Mode: review` | `APPROVED`, `CHANGES_REQUESTED` |
| `implementer` | Production code only, non-TDD. Never touches tests; test findings are tagged `test-step` and left open | `Task`, `Mode: build-slice \| fix-slice-findings \| fix-review-findings \| kill-mutants \| close-dod-gaps`, `Commands:`, `Slice: <N>` on slice modes | `green`, `blocked`; token `DONE` per mode |
| `unit_test_writer` | Unit tests only. Never touches production code; defects a test exposes stay recorded as open production rows | `Task`, `Mode: cover-criteria \| cover-gaps`, `Commands:`, `Slice: <N>`, `Report:` on `cover-gaps` | `covered`, `blocked`; token `DONE` on `cover-gaps` only |
| `implementer_tdd` | Strict TDD, self-contained: writes both tests and code. Same modes as `implementer` | `Task`, `Mode`, `Commands:`, `Slice: <N>` | `green`, `blocked`; token `DONE` per mode |
| `reviewer_slice` | Quick per-slice review, scoped to the slice's diff. Runs the suite itself → `review-slice-<N>.md` | `Task`, `Mode: review-slice`, `Slice: <N>`, `Commands:`, `Base:` | `APPROVED`, `CHANGES_REQUESTED`; `blocked` when the previous slice's record has no `closing-commit:` line |
| `reviewer_engineering` | The exhaustive review: code, architecture & dependencies, performance, security, in one pass over the diff. Never runs CI itself | `Task`, `Mode: full-review \| delta-review`, `Base: <ref>` | `APPROVED`, `CHANGES_REQUESTED` |
| `mutation_tester` | Reads the mutation tool's captured log → `mutation.md`. Measures only; escalate-only, never edits | `Task`, `Mode: report`, `Log: <path>` | `PASS`, `SURVIVORS`, `NO_CHANGED_SOURCE`, `FAILED` |
| `dod_validator` | Re-runs the full Definition of Done checklist → `dod.md`. Validates only | `Task`, `Mode: validate`, `Commands:`, `Base: <ref>` | `PASS`, `DOD_FAILED` |

## Pairing rules

- **A spec step that reads `user-story.md` has a story step.** `spec_partner` opens by reading
  `user-story.md` and treats what it settles as decided, so a workflow that
  specs anything puts a story node ahead of it — a `story_partner` copy in
  one of its modes (the dial runs from a full interview down to a single
  `capture` of a pasted ticket), or an authored agent that writes the same
  `user-story.md`. The rule binds through the artifact: an authored spec
  agent whose own file never reads `user-story.md` needs no story step.
  Whatever `capture` leaves undecided it writes under
  `## Open questions`, and those are the first areas the spec interview
  settles; that handover is what keeps the problem side from going unasked.
  The rule runs one way: a story step is free to stand alone.
- **Non-TDD split**: `implementer` (production code) + `unit_test_writer`
  (tests) are independent — neither references or waits on the other's
  internals; the workflow's step order is the only coupling.
- **A slice loop pairs its reviewer with a hash-recording fix step.**
  `reviewer_slice` diffs slice N from the `closing-commit: <hash>` line the
  previous slice's fix step wrote at the end of its build record
  (`implementation-<N>.md` / `tdd-<N>.md`), and slice 1 from `Base:`. So
  whichever builder closes a slice — an authored one included — commits the
  slice and ends its record with that line, or the next slice's review
  returns `blocked` naming the record, halting the run.
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
- **Parallel only for disjoint work.** `parallel: true` on a `run:` or agent
  that does not share writes with in-flight siblings and does not need the
  human. Interviews, gates, and paired implementer/test-writer steps stay
  sequential — the pairing's coupling is the YAML order. Join with `wait:`
  before any node that depends on the result.

## Tool scopes

A node may carry `allowed_tools:` to narrow what that step's subagent reaches
for (capabilities, mapped to host tools by the lead — see `running.md`). The
scope follows from what the agent's own file tells it to do, so the bundled
agents fall into three groups:

| Scope | Agents | Why |
| --- | --- | --- |
| `[read, search, edit, web]` | `spec_reviewer`, `reviewer_engineering`, `mutation_tester` | they read the tree or a captured log and write a verdict; they never run the suite themselves |
| `[read, search, edit, web, shell]` | `implementer`, `implementer_tdd`, `unit_test_writer`, `reviewer_slice`, `dod_validator` | they are invoked with `Commands:` and run them |
| host default (omit the key) | `story_partner`, `spec_partner` | an interview follows the human wherever they point it, and writes its own log every turn; a `capture` reads whatever `Source:` names, a URL included |

`edit` is in every scope because every agent writes its report under
`.awc/tasks/in-progress/<task>/`, and `web` is in every scope because any of
them may need to look up a library's docs, an error message, or a CVE.
`shell` is the line that actually separates the groups. `spawn` is granted to
none of them — these agents do their own work rather than delegating it.

Scoping is optional per node, and a scope that contradicts the agent's
invocation is worse than none — the step halts as `blocked` naming the
capability it was denied. When in doubt, omit the key.

## Canonical loop shapes

Interview (`until: USER_STORY_WRITTEN` / `SPEC_BUNDLE_WRITTEN`, cap ~20–30):

1. `story_partner` — `Mode: interview. Request: {{request}}. The human's previous answer: {{answer}}` — `expect: user_story`

   or, for the spec half — `spec_partner` — `Mode: write-bundle. Format: {{format}}. The human's previous answer: {{answer}}` — `expect: spec_drafted`

   Every iteration spawns a **new** subagent, and `{{answer}}` is the latest
   answer alone (see `running.md`), so the agent's memory of the interview is
   the log it reads and extends each turn — authoring rule 8 below has the
   shape. Each interviewer owns one log (`story-interview-log.md`,
   `spec-interview-log.md`), and `spec_partner`'s belongs to `write-bundle`
   alone, so a later approval loop never writes into an interview slot.
   Pass `{{answer}}` and nothing more: the lead never reconstructs earlier
   turns into the prompt.

The story half has two leaner shapes, for a workflow whose problem statement
already exists — a spec written elsewhere, a ticket, a design doc. Both still
produce `user-story.md`, so the spec step reads the same file either way:

Capture (a plain node, no loop, no questions):

1. `story_partner` — `Mode: capture. Source: {{source}}` — `expect: user_story`

   `{{source}}` is a path, a URL, or the request text itself, declared as an
   input like any other. The agent decides which by shape, narrowly: a path is
   one space-free token that starts with `/` or `./`, ends in a file
   extension, or names something in the repo; a URL starts with `http://` or
   `https://`; anything else — a sentence, a pasted ticket body, a slug like
   `fix/login-redirect` — *is* the material. Only a path- or URL-shaped value
   that will not open halts the step, so a workflow may pass either a dump
   file or the ticket text through the same input. A source
   behind an authenticated tool gets a `run:` node ahead of this one that
   dumps it to a file, and `Source:` names that file — the capture reads, it
   does not fetch credentials. What the source leaves undecided lands under
   `## Open questions` in the story, and the spec interview asks it. Single
   run, so `expect:` alone judges it: this mode returns no token, so a
   `capture` placed inside `until: USER_STORY_WRITTEN` could never close that
   loop — it belongs on a plain node.

Capture, then confirm (`until: USER_STORY_WRITTEN`, cap ~10):

1. `story_partner` — `Mode: capture-and-confirm. Source: {{source}}. The human's previous answer: {{answer}}` — `expect: user_story`

   Turn 1 reads the repo first, then records the source in the log (a fact
   the README or the code already answers is never queued as a question),
   then takes an ordinary question turn: it asks the first area the source
   left open — or, when the source settles every area, writes the story and
   closes the loop right there. Every later turn is an ordinary interview
   turn, same log, same closing rule. The cap is lower because the source did
   the opening work.

   Each turn of both looping modes therefore ends one of two ways — a question
   the lead relays, or the story plus its token. A turn that does neither
   leaves the loop with nothing to relay and no signal, and the run walks to
   its cap.

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
4. `reviewer_slice` — `Mode: review-slice. Slice: {{iteration}}. Commands: {{test_command}}. Base: {{base}}.`
5. `unit_test_writer` — `Mode: cover-gaps. Report: review-slice-{{iteration}}.md. Commands: {{test_command}}.`
6. `implementer` — `Mode: fix-slice-findings. Slice: {{iteration}}. Commands: {{commands}}.`

Exhaustive review round (`until: DONE`, cap ~2):

1. `run:` CI
2. `reviewer_engineering` — `Mode: full-review. Base: {{base}}.`
3. `unit_test_writer` — `Mode: cover-gaps. Report: review.md. Commands: {{test_command}}.`
4. `implementer` — `Mode: fix-review-findings. Commands: {{commands}}.`
5. `run:` CI again — never end a round on an unverified tree

Mutation round (`until_run:` a gate script reading the tool's log, cap ~4) —
placed after the exhaustive review round, so the review's fixes are
mutation-tested too:

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

## Finishing a run

A workflow whose agents write a task trail archives it in one node at the end —
no agent does this:

```yaml
  - id: finish
    run: workflows/<name>/scripts/finish-task.sh {{task}}
```

`scripts/finish-task.sh` is copied verbatim from `assets/finish-task.sh` into
the package's `scripts/`, `chmod +x`. Moving
`.awc/tasks/in-progress/<task>/` — `tmp/` and all — to
`.awc/tasks/done/<task>/` is the whole of it: it never touches git, and
re-running it on a resumed run is a no-op, so the node needs no `when:`. It
rejects a `<task>` that is not an id of letters, digits, hyphens, or
underscores, and halts when there is no trail to
archive — so a workflow whose agents write somewhere else entirely ships no
`finish` node.

**Write the path from the launch directory.** A `run:` command executes where
the session started (the repo or worktree root), not beside the YAML — only
`agent:` paths are workflow-relative. So the node names
`workflows/<name>/scripts/finish-task.sh`, matching the package layout.

The move lands in the working tree uncommitted. A workflow that commits its
trail commits it the way it commits any ownerless artifact — a small authored
committer agent, invoked with the two paths this move touches (see "Commits
always belong to an agent" above) — in a node after `finish`.

`finish` goes after everything that reads or writes an artifact: after the DoD,
after every gate, and after a `wait:` for every `parallel: true` node that
writes to the trail. Draining those at the end of the list would leave them
writing into a directory that has already moved.

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
   `.awc/tasks/in-progress/<task>/` — `tmp/` unless a human approves the file
   directly — never pasted into chat. Loop-enders append
   `<promise>DONE</promise>` only when their documented condition holds.
7. **A blocked command is `blocked`** — never "verified by inspection".
8. **A loop that builds on earlier turns names its own log.** Every iteration
   is a fresh subagent and the prompt carries `{{answer}}`'s latest value alone
   (see `running.md`), so any agent asking the human one question per turn —
   an interview, a triage, an outline session — gets a log under
   `.awc/tasks/in-progress/<task>/tmp/`, named in the agent file, in the shape
   the bundled interviewers use: one `Q:`/`A:` entry per question, headed by
   the area it settles. A follow-up opens a new entry repeating that area —
   never a second pair under an old one — so the last entry is always the
   only open one. Each turn the agent reads the log first and fills the
   arriving answer in; a question turn then appends its question with a blank
   `A:`, the closing turn appends nothing, and the first turn creates the log
   and asks. An entry is only ever appended with its question in it, so no
   blank sits waiting and holds the loop open.
   Scope the log to the mode that interviews — other modes read the artifacts.
   The node passes `{{answer}}` and nothing more.
