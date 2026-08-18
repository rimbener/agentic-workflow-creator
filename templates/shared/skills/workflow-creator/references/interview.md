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
- Answers create follow-ups — chase them until the area is settled. Don't
  move on with an ambiguity you'd have to guess at while writing the YAML.

## Areas to settle

**1. Goal and shape.** What does one run produce, end to end? What is a
"task" here — a feature, a bug fix, a document, a refactor? What's the
workflow's kebab-case name? What does "done" look like, observably?

**2. Inputs.** What must the human supply at launch? Default: one `task`
input — a kebab id that names `.awc/tasks/<task>/` and the branch. Freeform
prose (the request itself) can ride along as a second input. Anything else a
node needs (ticket URL, target dir) is another input or a var.

**3. Isolation.** *Do you want the workflow to work in a worktree or on the
current branch?* Worktree → two decisions: the branch naming (`task/<task>`
default) and the worktree path (`.worktrees/<task>` default). Those go into
the launch script (`assets/run.sh` → `./<name>.sh`), which cuts the tree from
the current branch, or reuses it, and starts the host inside it — not a YAML
node. The package must already be committed on the current branch before the
first run. The worktree stays after the agent exits; do not generate a remove
node. In-place → slash-command / skill launch from the current checkout; no
launch script.

**4. Bootstrap.** *Is there a command to bootstrap the environment?* Install,
codegen, services, a docs server — **one node per command**, in order. If
someone proposes a `bootstrap.sh` that installs deps *and* seeds folders
*and* commits, that's three nodes.

**5. Spec.** Should a story interview settle the problem first
(`story_partner`)? Should a spec interview produce the bundle
(`spec_partner`)? *Do you want Gherkin or plain acceptance criteria?* (the
`Format:` argument). Automated review before the human sees it
(`spec_reviewer` + a fix step)? Where is the human sign-off — the single
approval loop? Commit the approved spec as its own node?

**6. Build.** *Should the implementation be done in vertical slices?*
Then: TDD (`implementer_tdd`, self-contained) or the split pairing
(`implementer` + `unit_test_writer`, independent)? *Should each slice be
reviewed — and is that review quick or exhaustive?* Quick = `reviewer_slice`
in the loop; exhaustive-per-slice is usually overkill — recommend quick per
slice plus one exhaustive review at the end. Iteration cap for the loop
(cap hit = halt = escalation, so a tight cap is a feature).

**7. Testing.** Which test layers exist or should exist — unit, integration,
e2e? *Do you want mutation testing?* (needs: a `run:` step that runs the tool
scoped to changed files and captures its log, `mutation_tester` to report,
fix steps, and an `until_run:` gate script that reads the tool's log). E2e as
its own `run:` node or agent step. Collect the **exact commands** for each
layer.

**8. Command hygiene.** For every command collected: recommend the variant
that **prints output only on failure** — `bun test --only-failures`, quiet
reporters, `--silent` installs. Why: every line a command prints lands in the
lead's or an agent's context; a green run should cost near-zero tokens.
Verify each command does **one thing** — a `check` script that chains
typecheck + lint + test is fine to *call* as one gate, but if a phase needs
the parts separately, they're separate nodes.

**9. Quality.** *Is there an exhaustive review at the end?*
(`reviewer_engineering`, with `Base:`). How many rounds before the cap halts?
Should a re-review run only when fixes touched production source (a `when:`
predicate on the node)?

**10. DoD and gates.** A final Definition-of-Done validation
(`dod_validator`)? Besides the spec approval, where else must a human
approve — pre-merge `gate:`, a mid-run checkpoint? Every gate is a `gate:`
node or an interactive loop, never an agent's own judgment.

**11. Finalize.** Commit-message convention? Should the `.awc/tasks/<task>/`
trail be committed with the work (recommend yes — reviewers and the DoD diff
committed history)? Push / open a draft PR (its own node), or stop at "branch
ready"? The worktree is left in place for a manual PR — not removed.

## From answers to nodes

Map each settled area to nodes using the canonical shapes in
`agent-catalog.md`, then walk the sequence start to finish looking for gaps:

- every loop has `until:` **or** `until_run:`, plus `max_iterations`;
- every agent node has `expect:`, and passes every argument its agent's file
  says it needs (`Commands:`, `Base:`, `Log:`, `Report:`, `Format:`,
  `Slice:`);
- every `run:` node is one short command; anything longer is a script in
  `scripts/` that still does exactly one thing;
- nothing runs after an edit without a verification step, and no review
  round ends on an unverified tree.

Present the resulting node list to the user as a compact table (id, type,
what it does, exits) and get an explicit yes before writing any file.
