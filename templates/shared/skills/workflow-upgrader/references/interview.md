# The upgrade conversation

Creating a workflow needs a relentless interview because nothing is settled
yet. Upgrading one is the opposite problem: everything is settled, in writing,
in the package you just inventoried — and what should change is not a
question for the user at all, because the audit answers it. So the
conversation is narrow and short: which package, what the audit found, and the
few decisions a migration genuinely forces.

The same manners hold: **one question per turn**, your recommended answer and a
one-line why, the decision always the user's. And the same division of labor:
facts you can read — from the package, the repo, the git history, a failing
run's output — you look up rather than ask.

## Before you ask anything

**Mine the package.** It is the record of the last interview — "The package
is the record" in the skill's rules. Read decisions from it; ask only what it
does not answer.

**Mine the audit.** Every line of the upgrade group is a migration with a
recipe in `references/upgrade-playbook.md`, and the recipe names what it
ripples into; those ripples are what you actually need answers about, if
anything.

**Mine the failure, when there is one.** An upgrade prompted by a broken run
starts from the run: which node halted, what the agent's report file says, what
the command printed. Often the cause is one of the audit's findings — a stale
lead file blocking an `inline:` node, a validator demanding an artifact at its
old path — and the fix is the migration, not something the user has to decide.

## What to actually ask

**Which package**, only when the repo holds several — name them, with their
one-line `description:`. With exactly one, name it and start.

**The audit's independent findings.** Offer them as a short list, once, and
take the user's answer as final. This is the one question that belongs to
upgrades alone, and it is the closest this session comes to asking what
should change.

**A decision a migration forces.** Most migrations force none — a verbatim
recopy, a path change, a protocol taken from the base. The ones that do:

- **Hand-edits that collide with the migration.** Carry every hand-edit
  across without asking; that is the default. Ask only when one contradicts
  the text the base now carries — a hand-written check at the old trail
  path, say — and offer the carried-across version as your recommendation.
- **A gap the dialect requires filled.** A `spec_partner` step with no story
  step ahead of it needs one, and the story step has three modes; the
  playbook's recipe says which to recommend. That is a creator's area
  reopened, and the full list lives in
  `../workflow-creator/references/interview.md` — pull from it only what the
  gap touches.
- **Trails on disk.** Existing trails at an old layout are left alone or
  moved by hand — the user's call, with "leave them" as the default.

**The blast radius the user may not have priced in.** A trail migration
rewrites every agent file; moving an interview inline touches five places;
either one changes a run already in flight under `.awc/tasks/in-progress/`.
Say so and confirm before planning it.

## What not to ask

- **What should change.** That is the audit's job, and a session that opens
  by asking it has turned into an edit session. If the user volunteers a
  change to what the workflow does — a phase, an agent, an input, a cap —
  name it as an edit for `awc <agent> --edit` and carry on with the upgrade.
- Anything the package answers. Confirm it in the plan instead: "this stays a
  worktree workflow, plain acceptance criteria, cap 6 on the slice loop."
- The creator's interview. An upgrade reopens nothing the package has
  settled; if the user wants the package rethought, that is a rewrite — say
  so and hand over to the workflow-creator skill.
- Repo facts. Test runner, lint command, CI config, whether a script exists —
  read them.
- Permission to do the ripples. Ripples are part of the migration, not extras;
  they belong in the plan you present, not in a question.

## Closing the conversation

You are done when you could write the diff without guessing once. Then
present the upgrade plan per the skill's step 5 and get the explicit yes
before writing anything.
