# The interview

The workflow is only as good as the shared understanding behind it, so the
interview is relentless: cover every area below before designing a single
node. But relentless means thorough, not repetitive:

- **One question per turn**, with your recommended answer and a one-line why.
  The decision is always the user's.
- **Mine the opening prompt first.** Users often describe their flow up
  front — treat every answered area as settled, confirm it in your plan
  summary instead of re-asking.
- **Look facts up yourself.** The toolchain, test runner, lint/typecheck
  commands, and quiet flags are facts in the repo (manifest, lockfile, CI
  config, README) — read them before asking anything. Only *decisions* belong
  to the user.
- **Skip areas the goal makes irrelevant** (a docs-writing workflow needs no
  mutation testing), but say what you skipped and why when presenting the
  plan, so a wrong skip gets caught.
- **The bundled agents are defaults, not the menu.** Any agent slot below can
  instead be filled by an agent authored for this workflow (the catalog's
  authoring rules) — offer that when no base fits or the user prefers their
  own.
- Answers create follow-ups — chase them until the area is settled. Don't
  move on with an ambiguity you'd have to guess at while writing the YAML.

## Areas to settle

**1. Goal and shape.** What does one run produce, end to end? What is a
"task" here — a feature, a bug fix, a document, a refactor? What's the
workflow's name (an id of letters, digits, hyphens, or underscores)? What
does "done" look like, observably?

**2. Inputs.** What must the human supply at launch? Default: one `task`
input — an id of letters, digits, hyphens, or underscores, in any case, that
names `.awc/tasks/in-progress/<task>/` and the branch.
Freeform prose (the request itself) can ride along as a second input. Anything
else a node needs (ticket URL, target dir) is another input or a var.

**3. Isolation.** *Do you want the workflow to work in a worktree or on the
current branch?* Worktree → the worktree path (`.worktrees/<task>` default)
goes into the launch script FILL (`assets/run.sh` → `./<name>.sh`). Branch
naming (`task/<task>` default) and the workflow name are asked at launch,
never baked in — mechanics in `references/hosts.md`. The script cuts the tree
from the current branch, or reuses it, and starts the host inside it — not a
YAML node. The package must already be
committed on the current branch before the first run. The worktree stays
after the agent exits; do not generate a remove node. In-place →
slash-command / skill launch from the current checkout; no launch script.

**4. Bootstrap.** *Is there a command to bootstrap the environment?* Install,
codegen, services, a docs server — **one node per command**, in order. If
someone proposes a `bootstrap.sh` that installs deps *and* seeds folders
*and* commits, that's three nodes.

**5. Story and spec.** Should a spec interview produce the bundle
(`spec_partner`)? A workflow whose output *is* the user story just takes the
story half of this area and skips the rest (the catalog's pairing rule runs
one way). With a `spec_partner` step in, the workflow needs a `user-story.md`
for it to open with, and the question becomes *how that file gets written*:
**ask where the problem statement comes from.** The bundled agent for this
slot is `story_partner`, in three shapes, all writing the same file —

- `interview` — an `inline:` node: the lead runs it in its own session and
  grills the user one question at a time, log-backed, working from the raw
  request (`Request:`). Recommend this when the work starts from a rough idea.
- `capture` — a single spawned node, no questions: it structures what
  `Source:` carries — a path, a URL, or the request text itself. Recommend
  this when a ticket or a design doc already states the problem.
- `capture-and-confirm` — an `inline:` node too: reads the source, then asks
  only about what it left open; a source that settles every area closes on
  turn 1. The middle setting, for a thin ticket.

`capture` is the mode that hands work on: what it could not settle it writes
under `## Open questions`, and the spec interview settles those first. The
dial is really how much of the problem the human answers here versus in the
spec interview. A source living in a tracker only an authenticated tool can
reach is dumped to a file by a `run:` node first, and `Source:` names that
file — the capture modes read files and inline text, never a tracker.
Then: *Do you want Gherkin or plain acceptance
criteria?* (the `Format:` argument). Automated review before the human sees it
(`spec_reviewer` + a fix step)? Where is the human sign-off — the single
approval loop? Commit the approved spec as its own node?

**6. Build.** *Should the implementation be done in vertical slices?*
Then: TDD (`implementer_tdd`, self-contained) or the split pairing
(`implementer` + `unit_test_writer`, independent)? *Should each slice be
reviewed — and is that review quick or exhaustive?* Quick = `reviewer_slice`
in the loop — its node passes `Base:` (the task's base ref, usually a
`base` var), which slice 1 diffs against, and its pairing needs the fix step
to record the `closing-commit:` line (the catalog's slice-loop pairing
rule). Exhaustive-per-slice is usually overkill — recommend quick per
slice plus one exhaustive review at the end. Iteration cap for the loop
(cap hit = halt = escalation, so a tight cap is a feature).

**7. Testing.** Which test layers exist or should exist — unit, integration,
e2e? *Do you want mutation testing?* (needs: a `run:` step that runs the tool
scoped to changed files and captures its log, `mutation_tester` to report,
fix steps, and an `until_run:` gate script that reads the tool's log). E2e as
its own `run:` node or agent step. Collect the **exact commands** for each
layer.

**8. Command hygiene.** For every command collected: recommend the
failure-only variant, per SKILL.md's "Commands print only on failure" rule.
Verify each command does **one thing** — a `check` script that chains
typecheck + lint + test is fine to *call* as one gate, but if a phase needs
the parts separately, they're separate nodes.

**9. Quality.** *Is there an exhaustive review at the end?*
(`reviewer_engineering`, with `Base:`). How many rounds before the cap halts?
Should a re-review run only when fixes touched production source (a `when:`
predicate on the node)? Should a findings-fix step be skipped outright when
the review approved — a `when:` grepping the reviewer's one-word `-verdict`
file? Safe exactly when the step carries no commit; the slice loop's and the
review round's fix steps always run.

**10. Shrink.** *Should the run cut back the writing it added, right before
the last look at it?* (`text_shrinker`, wording only; the catalog's shrink
shapes.) Two decisions: `shrink-spec` between the spec review's fix step and
the human approval — recommend it wherever a spec review round exists; and
`shrink-comments` after the last step that edits code, with a gate `run:`
behind it — recommend it wherever a review or fix round rewrites code after
the build. A workflow that writes no code or specs nothing skips that half.

**11. DoD and gates.** A final Definition-of-Done validation
(`dod_validator`)? Besides the spec approval, where else must a human
approve — pre-merge `gate:`, a mid-run checkpoint? Every gate is a `gate:`
node or an interactive loop, never an agent's own judgment.

**12. Finalize.** Commit-message convention? Should the `.awc/tasks/` trail be
committed with the work (recommend yes — review and DoD steps diff against
committed history, so an uncommitted trail is invisible to them)? A workflow
whose agents write a task trail ends with a `finish` node archiving it — the
catalog's "Finishing a run" has the shape — and a committed trail needs a
committer-agent node after it to commit that move. Push / open a draft PR
(its own node), or stop at "branch ready"? The worktree is left in place for
a manual PR — not removed.

**13. Tool scope.** Once the node list is settled: *should any step be
scoped down to the tools it actually needs?* The natural candidates are the
steps that read and report without running anything (an exhaustive review, a
mutation report). Recommend leaving the rest at the host default, and draw
any scope by the grant rules in SKILL.md's "Tool scope is per node" and the
catalog's Tool scopes table. `inline:` steps take no scope: the lead runs
them itself, so there is no subagent to narrow.

## From answers to nodes

Map each settled area to nodes using the canonical shapes in
`agent-catalog.md`, then walk the sequence start to finish looking for gaps:

- every loop has `until:` **or** `until_run:`, plus `max_iterations`;
- every step that converses with the human is an `inline:` node carrying
  `agent:`, `prompt:` and `expect:` alone — both story interviewing modes and
  the spec interview; a loop there would spawn an agent that can ask only
  once;
- every agent node has `expect:`, and passes every argument its agent's file
  says it needs (`Commands:`, `Base:`, `Log:`, `Report:`, `Format:`, `Slice:`,
  `Request:`, `Source:`) — a story node in a capture mode carries `Source:`,
  and whatever that argument names is a declared input or var;
- every loop's last agent step is one whose file emits the loop's `until:`
  token; a single-run agent returns its signal line alone, so it goes on a
  plain node — `story_partner`'s `capture` is the one to watch;
- every `run:` node is one short command; anything longer is a script in
  `scripts/` that still does exactly one thing;
- independent checks or agents on disjoint paths may be `parallel: true`
  with a later `wait:`; interviews, gates, and anything that edits the same
  files stay sequential;
- every `allowed_tools:` covers what its agent's file says it does;
- nothing runs after an edit without a verification step, and no review
  round ends on an unverified tree.

Then hand back to SKILL.md's Design step: the node table and the explicit
yes live there.
