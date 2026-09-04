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
  - Protocol 1, the log paragraph and the question ticks are marked
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

`workflow_lead.md` is the exception: it is workflow-neutral, with nothing
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
| `workflow_lead` | Runs the workflow: invokes agents, enforces gates and caps, collects parallel work, escalates on halt. Coordination only — never commits, and never writes except while an `inline:` node has it acting as that node's agent | `Task/Mode/Workflow` (supplied by the launch command) | `complete`, `halted`, `blocked` |
| `story_partner` | Writes `user-story.md` — the artifact the spec step reads. `interview` grills the human one question at a time, `capture` structures a source they already wrote, `capture-and-confirm` does both; the interviewing modes run on an `inline:` node and keep `story-interview-log.md` as the interview's record. Owns the *problem*, never the solution | `Task`, `Mode: interview \| capture \| capture-and-confirm`, `Request:` (`interview`), `Source:` (capture modes) | `user_story`; `blocked` when `Source:` cannot be read |
| `spec_partner` | Opens by reading `user-story.md` (`write-bundle` halts as `blocked` without it; the later modes read it when it is there). Interview on an `inline:` node (record in `spec-interview-log.md`, `write-bundle` only) → spec bundle (`spec.md`, `acceptance-criteria.md`, `subtasks.md`, `subtask-N.md`) with vertical slices | `Task`, `Mode: write-bundle \| fix-spec-findings \| present-for-approval`, `Format: plain\|gherkin` | `spec_drafted`, `findings_resolved`, token `SPEC_APPROVED`, `blocked` |
| `spec_reviewer` | One-round automated review of the spec bundle → `review-spec.md`, verdict recorded via the `Verdict-writer:` script → 1-line `review-spec-verdict.md`, before the human approval | `Task`, `Mode: review`, `Verdict-writer: <path>` | `APPROVED`, `CHANGES_REQUESTED` |
| `implementer` | Production code only, non-TDD. Never touches tests; test findings are tagged `test-step` and left open | `Task`, `Mode: build-slice \| fix-slice-findings \| fix-review-findings \| kill-mutants \| close-dod-gaps`, `Commands:`, `Slice: <N>` on slice modes | `green`, `blocked`; token `DONE` per mode |
| `unit_test_writer` | Unit tests only. Never touches production code; defects a test exposes stay recorded as open production rows | `Task`, `Mode: cover-criteria \| cover-gaps`, `Commands:`, `Slice: <N>`, `Report:` on `cover-gaps` | `covered`, `blocked`; token `DONE` on `cover-gaps` only |
| `implementer_tdd` | Strict TDD, self-contained: writes both tests and code. Same modes as `implementer` | `Task`, `Mode`, `Commands:`, `Slice: <N>` | `green`, `blocked`; token `DONE` per mode |
| `reviewer_slice` | Quick per-slice review, scoped to the slice's diff. Runs the suite itself → `review-slice-<N>.md`, verdict recorded via the `Verdict-writer:` script → 1-line `review-slice-verdict-<N>.md` | `Task`, `Mode: review-slice`, `Slice: <N>`, `Commands:`, `Base:`, `Verdict-writer: <path>` | `APPROVED`, `CHANGES_REQUESTED`; `blocked` when the previous slice's record has no `closing-commit:` line |
| `reviewer_engineering` | The exhaustive review: spec scope & test traceability, architecture & dependencies, performance, security, in one pass over the diff → `review.md`, verdict recorded via the `Verdict-writer:` script → 1-line `review-verdict.md`. Never runs CI itself | `Task`, `Mode: full-review \| delta-review`, `Base: <ref>`, `Verdict-writer: <path>` | `APPROVED`, `CHANGES_REQUESTED` |
| `mutation_tester` | Reads the mutation tool's captured log → `mutation.md`. Measures only; escalate-only, never edits | `Task`, `Mode: report`, `Log: <path>` | `PASS`, `SURVIVORS`, `NO_CHANGED_SOURCE`, `FAILED` |
| `dod_validator` | Re-runs the full Definition of Done checklist → `dod.md`. Validates only | `Task`, `Mode: validate`, `Commands:`, `Base: <ref>` | `PASS`, `DOD_FAILED` |
| `text_shrinker` | Cuts the writing this run added to what a reader still needs, before the last look at it → `shrink-comments.md` / `shrink-spec.md`. `shrink-comments` rewrites only comments changed since `Base:`, proves the code fingerprint unchanged, runs `Commands:` and commits; `shrink-spec` tightens the bundle's prose, every criterion, scenario and subtask unchanged, and leaves the commit to the bundle's committer | `Task`, `Mode: shrink-comments \| shrink-spec`, `Base: <ref>` and `Commands:` on `shrink-comments` | `trimmed`, `blocked` |

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
  (`implementation-<N>.md` / `tdd-<N>.md`), and slice 1 from
  `Base:`. So whichever builder closes a slice — an authored one included —
  commits the slice, ends its record with that line, and commits that record
  update too as its own small trail commit (a record left dirty bleeds into
  the next slice's diff) — or the next slice's review returns `blocked`
  naming the record, halting the run.
- **TDD**: `implementer_tdd` replaces the pair — it owns both sides. Don't put
  `unit_test_writer` in its slice loop.
- **`test-step` routing**: gates that write findings files (`reviewer_slice`,
  `dod_validator`, `implementer` in `kill-mutants`) tag test-side rows
  `test-step`. Route those to `unit_test_writer` `cover-gaps` with
  `Report: <that file>`; untagged rows are the implementer's. In the split
  pairing, a findings loop therefore usually holds *both* fix steps.
- **A shrink sits after the last edit and before the last look.** Words
  added after it undo it; a judgment before it reads text that will not
  land. `shrink-spec` goes between the spec review's fix step and the human
  approval loop. It never commits, so the workflow commits the bundle *after*
  the approval — the authored committer "Commits always belong to an agent"
  calls for — and that commit carries the rewrite. `shrink-comments` goes
  after the last step that edits code — the slice loop when nothing follows
  it, else the exhaustive review round, else the mutation round — before
  the DoD, with a `run:` of its `Commands:` gate behind it. It commits its
  own rewrite, like every fix mode: the DoD's fix steps commit only what
  they change, so a rewrite left to them would sit dirty. Its `expect:` is
  `trimmed` alone — `blocked` halts, as everywhere.
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
- **An interview is an `inline:` node.** A step whose work *is* a
  conversation with the human — `story_partner`'s `interview` and
  `capture-and-confirm`, `spec_partner`'s `write-bundle`, any authored agent
  that asks one question at a time — runs inline: the lead acts as that agent
  in its own session, so the exchange is one conversation (see `running.md`
  §`inline:`). The node holds `agent:`, `prompt:` and `expect:` only — no
  `{{answer}}`, no `max_iterations`, no completion token, never
  `parallel: true` or `allowed_tools:`. The cap goes with the loop and nothing
  replaces it — every exchange waits on the human — but its escalation moves
  into the agent: an interview that cannot settle an area, or is told to
  stop, returns the `blocked` line its file defines rather than guessing or
  asking on. `story_partner`'s `capture` asks nothing, so it stays a plain
  spawned `agent:` node. Approval loops stay loops: each round is one
  self-contained present-and-answer, closed by its token.
- **Parallel only for disjoint work.** `parallel: true` on a `run:` or agent
  that does not share writes with in-flight siblings and does not need the
  human. Interviews, gates, and paired implementer/test-writer steps stay
  sequential — the pairing's coupling is the YAML order. Join with `wait:`
  before any node that depends on the result.

## Tool scopes

A node may carry `allowed_tools:` to narrow what that step's subagent reaches
for (capabilities, mapped to host tools by the lead — see `running.md`). The
scope follows from what the agent's own file tells it to do, so the bundled
agents fall into these groups:

| Scope | Agents | Why |
| --- | --- | --- |
| `[read, search, edit, web]` | `mutation_tester`, `text_shrinker` in `shrink-spec` | they read files and write a report; no command to run |
| `[read, search, edit, web, shell]` | `implementer`, `implementer_tdd`, `unit_test_writer`, `reviewer_slice`, `dod_validator`, `text_shrinker` in `shrink-comments` | they are invoked with `Commands:` and run them |
| `[read, search, edit, web, shell]` | `spec_reviewer`, `reviewer_engineering` | the one command they run is the package's `scripts/write-verdict-file.sh`, recording the verdict; never the suite |
| no scope at all (an `inline:` node takes none) | `story_partner` interviewing, `spec_partner` `write-bundle` | the lead runs these itself, with its own tools; there is no subagent to scope |
| host default (omit the key) | `story_partner` `capture`, `spec_partner`'s later modes | a `capture` reads whatever `Source:` names, a URL included; an approval or fix turn works from the files it was pointed at |

`edit` is in every scope because every agent writes its report under
`.awc/tasks/in-progress/<task>/`, and `web` is in every scope because any of
them may need to look up a library's docs, an error message, or a CVE.
`shell` is the line that separates the first group from the rest — even the
reviewers run exactly one command, the verdict writer. That script is copied
verbatim from `assets/write-verdict-file.sh` into the package's `scripts/`,
`chmod +x`; the YAML passes its package path to each reviewer as the
`Verdict-writer:` argument (a missing one is `CHANGES_REQUESTED`), and the
reviewer execs it with the review file and its verdict to produce the
one-line verdict file the review step names.
`spawn` is granted to
none of them — these agents do their own work rather than delegating it.

Scoping is optional per node, and a scope that contradicts the agent's
invocation is worse than none — the step halts as `blocked` naming the
capability it was denied. When in doubt, omit the key.

## Canonical node shapes

Interview (an `inline:` node — no cap, no token, one conversation):

```yaml
  - id: story
    inline:
      agent: agents/story_partner.md
      prompt: "Task: {{task}}. Mode: interview. Request: {{request}}."
      expect: user_story
```

1. `story_partner` — `Mode: interview. Request: {{request}}` — `expect: user_story`

   or, for the spec half — `spec_partner` — `Mode: write-bundle. Format: {{format}}` — `expect: spec_drafted`

   The lead runs the agent in its own session, so the interview is one
   conversation, ending when the artifact is written (see `running.md`
   §`inline:`). Nothing is relayed, so the node carries no `{{answer}}`, no
   `max_iterations` and no `until:`. Each interviewer owns one log
   (`story-interview-log.md`, `spec-interview-log.md`) — the interview's
   record and relaunch point; authoring rule 8 has the shape.
   `spec_partner`'s belongs to `write-bundle` alone, so a later approval loop
   never writes into an interview slot.

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
   run, so `expect:` alone judges it: this mode asks nothing, so it belongs
   on a plain spawned `agent:` node — an `inline:` node would put the lead in
   a conversation nobody is having, and a token-closed loop could never close
   over a mode that returns no token.

Capture, then confirm (an `inline:` node, like the interview above):

1. `story_partner` — `Mode: capture-and-confirm. Source: {{source}}` — `expect: user_story`

   It reads the repo first, then records the source in the log (a fact
   the README or the code already answers is never queued as a question),
   then interviews for whatever the source left open — or, when the source
   settles every area, writes the story right there having asked nothing.
   Same log, same closing rule as the interview.

   Both interviewing modes end once, with the story and its return line;
   every exchange before it is one question and its answer.

Single human sign-off of an artifact (a loop — each round is one
self-contained present-and-answer — `until: SPEC_APPROVED`, cap ~10):

1. `spec_partner` — `Mode: present-for-approval. Format: {{format}}. The human's response: {{answer}}` — `expect: SPEC_APPROVED`

   Presenting and edit turns end as approval requests the lead relays to the
   human; only the turn after an explicit approval carries the
   `<promise>SPEC_APPROVED</promise>` token. That closing turn returns a
   summary, never a signal line — it satisfies `expect:` through the token
   rule in `running.md` (a return ending with a `<promise>` token naming an
   `expect:` entry passes). This is the idiom for any approval loop: one
   token as both the loop's `until:` and the step's `expect:`.

Spec review round (before the human approval; both nodes plain, judged by
`expect:`):

1. `spec_reviewer` — `Mode: review. Verdict-writer:
   workflows/<name>/scripts/write-verdict-file.sh.` — `expect: [APPROVED,
   CHANGES_REQUESTED]`
2. `spec_partner` — `Mode: fix-spec-findings.` — `expect: findings_resolved`,
   guarded by a `when:`:
   `grep -qx CHANGES_REQUESTED .awc/tasks/in-progress/{{task}}/tmp/review-spec-verdict.md`

   The guard reads the one-word verdict file the reviewer's writer recorded —
   never the review trail, whose prose moves its verdict line around. On
   `APPROVED` the grep exits non-zero and the fix step is skipped; a verdict
   file the reviewer never wrote fails the grep the same way, which is why
   recording it is the reviewer's hard rule. This guard belongs nowhere else:
   the slice loop's `fix-slice-findings` and the review round's
   `fix-review-findings` carry the closing commit — and the loop's `DONE`
   token — so they run whatever the verdict says.

Spec shrink (after the review round's fix step, before the approval loop; a
plain node, judged by `expect:`):

1. `text_shrinker` — `Task: {{task}}. Mode: shrink-spec.` — `expect: trimmed`,
   `allowed_tools: [read, search, edit, web]`

   The human approves the wording that will land. `expect:` names `trimmed`
   alone — `blocked` halts under the lead's rule, and listing it would let a
   halt read as a pass. The committer after the approval loop carries the
   rewrite.

Slice build, split pairing (`until: DONE`, last step's token = all slices done):

1. `implementer` — `Mode: build-slice. Slice: {{iteration}}. Commands: {{commands}}.`
2. `unit_test_writer` — `Mode: cover-criteria. Slice: {{iteration}}. Commands: {{test_command}}.`
3. `run:` the slice check (typecheck/lint + tests, failure-only output)
4. `reviewer_slice` — `Mode: review-slice. Slice: {{iteration}}. Commands: {{test_command}}. Base: {{base}}. Verdict-writer: workflows/<name>/scripts/write-verdict-file.sh.`
5. `unit_test_writer` — `Mode: cover-gaps. Report: review-slice-{{iteration}}.md. Commands: {{test_command}}.`
6. `implementer` — `Mode: fix-slice-findings. Slice: {{iteration}}. Commands: {{commands}}.`

Exhaustive review round (`until: DONE`, cap ~2):

1. `run:` CI
2. `reviewer_engineering` — `Mode: full-review. Base: {{base}}. Verdict-writer: workflows/<name>/scripts/write-verdict-file.sh.`
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

Comment shrink (after the last step that edits code — the slice loop when
nothing follows it, else the exhaustive review round, else the mutation
round — and before the DoD settle; two plain nodes):

1. `text_shrinker` — `Task: {{task}}. Mode: shrink-comments. Base: {{base}}. Commands: {{commands}}.` — `expect: trimmed`, `allowed_tools: [read, search, edit, web, shell]`
2. `run:` the same gate `{{commands}}` names — the sandwich every fix step gets

   The step rewrites only comments changed since `Base:`, proves the code
   fingerprint unchanged, runs the gate and commits, so the DoD reads
   committed history. Not a loop step: a fix round after it adds words back.

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
8. **An agent that talks to the human runs inline, and names its own log.**
   Any agent asking the human one question at a time — an interview, a
   triage, an outline session — goes on an `inline:` node (see `running.md`)
   and gets a log under `.awc/tasks/in-progress/<task>/tmp/`, named in the
   agent file, in the shape the bundled interviewers use: one `Q:`/`A:` entry
   per question, headed by the area it settles. A follow-up opens a new entry
   repeating that area — never a second pair under an old one — so the last
   entry is always the only open one. The agent logs each question before it
   asks and each answer verbatim as it arrives, and writes its artifact only
   over a log with no blank `A:`. The log is committed with the trail and is
   where a relaunched run picks up — a last entry with a blank `A:` is the
   question nobody answered. Scope the log to the mode that interviews —
   other modes read the artifacts. The node passes no `{{answer}}`. Give the
   agent the exit the cap used to be: a `blocked` return naming what stayed
   open, for the area nobody can settle and the human who asks to stop.
9. **A loop step that builds on earlier iterations names its own record.**
   Every iteration is a fresh subagent and the prompt carries `{{answer}}`'s
   latest value alone (see `running.md`), so an agent whose loop body has to
   know what the previous round did reads and extends a file on disk rather
   than trusting the prompt — the build records the bundled implementers keep
   are that shape.
