# Eval fixtures — workflow-editor

An edit session starts from a repo that already holds a generated workflow
package — the same starting point as an upgrade — so the package-holding
evals reuse `../workflow-upgrader-workspace/fixtures/bun-app-shipped` rather
than carrying a second copy of the same package here to rot. As with the
upgrader's evals, an eval run copies the fixture into its run directory and
runs `git init && git add -A && git commit` in the copy.

What the shipped fixture offers the editor's evals is a package with nothing
wrong with it: the graded object is purely the session's conduct — stated
changes landing with their ripples, ungated; everything beyond them gated;
audit-shaped asks handed to `awc <agent> --upgrade`; run-shaped asks handed
to the package's own launchers; validation run in full. Its README in the
upgrader workspace tables what the package deliberately lacks — the split
pairing, mutation testing, a third input — which is what the apply evals
here ask for, since changing what a workflow does is the editor's job alone.

The one fixture that lives here is the one the shipped package cannot stand
in for:

## `bun-app-bare`

The same tiny bun app with **no workflow package at all** — no `workflows/`,
no launchers, no launch script. It exists for the hand-off eval: an edit
session pointed at it has nothing to edit, and the graded behavior is saying
so and handing the request to the workflow-creator skill loaded beside the
editor, never improvising a package.
