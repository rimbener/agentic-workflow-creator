# The scoped interview

Creating a workflow needs a relentless interview because nothing is settled
yet. Updating one is the opposite problem: almost everything is settled, in
writing, in the package you just inventoried. So the interview is narrow and
short — the areas the change reopens, and nothing else.

The same manners hold: **one question per turn**, your recommended answer and a
one-line why, the decision always the user's. And the same division of labor:
facts you can read — from the package, the repo, the git history, a failing
run's output — you look up rather than ask.

## Before you ask anything

**Mine the request.** People arrive with the change half-specified: "add
mutation testing", "the review loop keeps hitting its cap", "we're not doing
TDD any more". Each of those names a phase, and the playbook tells you what it
ripples into; those ripples are what you actually need answers about.

**Mine the package.** It is the record of the last interview. Isolation,
pairing, formats, caps, commands, gates, which artifacts exist, whether the
trail is committed — all of it is on disk. Asking a user to re-state a decision
their package already encodes wastes their turn and invites an answer that
contradicts what they run today.

**Mine the failure, when there is one.** An update prompted by a broken run
starts from the run: which node halted, what the agent's report file says, what
the command printed. The fix follows from that, and it is often not the change
the user proposed.

## What to actually ask

Three kinds of question earn a turn:

**The decision the change forces.** Adding a phase means choosing its shape —
which agent, quick or exhaustive, what cap, where it sits in the sequence.
These are the creator's areas, reopened one at a time; the full list lives in
`../workflow-creator/references/interview.md`, and you pull from it only what
the change touches.

**The ambiguity in the request.** "Add a review step" leaves open whether it
reviews each slice or the whole diff, whether it gates or reports, and whether
a fix step follows it. Chase these until you could write the node without
guessing.

**The blast radius the user may not have priced in.** When a small-sounding
change ripples wide — renaming a workflow touches nine paths; switching the
pairing rewrites every loop; the trail migration rewrites every agent file —
say so and confirm before planning it. Same for anything that touches a run
already in flight under `.awc/tasks/in-progress/`.

And one question that belongs to updates alone: **the audit's independent
findings.** Offer them as a short list, once, and take the user's answer as
final. Fixing an unrelated flaw uninvited is the fastest way to make a diff
unreviewable.

## What not to ask

- Anything the package answers. Confirm it in the plan instead: "this stays a
  worktree workflow, plain acceptance criteria, cap 6 on the slice loop."
- The whole creator interview. An update that reopens every area is a rewrite,
  and if that is genuinely what the user wants, say so and hand over to the
  workflow-creator skill.
- Repo facts. Test runner, lint command, CI config, whether a script exists —
  read them.
- Permission to do the ripples. Ripples are part of the change, not extras;
  they belong in the plan you present, not in a question.

## Closing the interview

You are done when you could write the diff without guessing once. Present the
change plan then — files added, edited, removed, left alone, each with its
reason, plus a before/after node list where the sequence moves — and get an
explicit yes before writing anything.
