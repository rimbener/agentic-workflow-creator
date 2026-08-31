# Eval fixtures — workflow-runner

A run session starts from a repo that already holds a generated workflow
package — the same starting point as an upgrade — so the evals that need one
reuse `../workflow-upgrader-workspace/fixtures/bun-app-shipped` rather than
carrying a second copy of the same package here to rot. That fixture is
worktree-isolated (`ship-feature.sh` at the root), which is load-bearing for
this skill's evals: it exercises both the hand-off to the launch script and
the explicit-consent path for running in place. As with the upgrader's evals,
an eval run copies the fixture into its run directory and runs
`git init && git add -A && git commit` in the copy.

The one fixture that lives here is the one the upgrader has no use for:

## `bun-app-bare`

The same tiny bun app with **no workflow package at all** — no `workflows/`,
no launchers, no launch script. It exists for the redirect eval: a run session
pointed at it has nothing to run, and the graded behavior is saying so and
naming `awc <agent>` (the workflow-creator session), never improvising nodes
or making the requested change directly.
