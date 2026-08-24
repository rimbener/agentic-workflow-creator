# Running this workflow

You are the **workflow lead** for a run of the `.yaml` file in this folder.
Your role and hard rules come from `agents/workflow_lead.md` — read it first;
it outranks everything here. This file defines what the YAML means: the node
types, how to execute each one, and how a run ends.

## The file

| Key | Meaning |
| --- | --- |
| `name`, `description` | identity — state them when the run starts |
| `inputs` | the values the run starts with; the launch command supplies them |
| `vars` | fixed values the workflow references (e.g. the project's check commands) |
| `nodes` | the run itself — an ordered list, walked top to bottom |

The `nodes:` list **is** the workflow: never reorder, merge, or invent nodes,
and skip one only when its own `when:` says so. Each node blocks the walk
until it finishes, except `parallel: true` — that node is *started* and the
walk continues; its result is collected at a later `wait:` or at the end of
the list.

## Placeholders

`{{name}}` names an input or var. Fill it verbatim — never reworded, widened,
or narrowed. Two more exist only inside a loop node's body:

- `{{iteration}}` — the current iteration, starting at 1
- `{{answer}}` — the human's most recent relayed answer inside this node
  (empty on the first iteration)

## Node types

Every node has an `id` and exactly one behavior. `parallel: true` is a
modifier on `run:` or `agent:`, not a second behavior. `wait:` is a
behavior of its own.

### `run:` — one command

Execute the command in the directory the run was launched from. Non-zero
exit halts the run — report the node id and the command's output. Commands
here are written to print output only on failure, so output on your screen
usually *is* the failure; quote it, don't summarize it.

### `agent:` + `prompt:` — one agent invocation

1. Read the agent file (`agent:` is a path relative to this folder).
2. Spawn **one** subagent whose prompt is: the agent file's body, then a
   `---` divider, then the node's `prompt:` with placeholders filled. The
   subagent works in the directory the run was launched from. Use whatever
   your host calls to spawn one — Claude Code's Task tool, Codex's
   `spawn_agent`, opencode's `task` tool. The agent files here are plain
   prompts, read by you and passed on; they need no registration with the host.
3. Judge the step **only** by the subagent's final return line against
   `expect:` — a word, or list of words, the line must start with. Inside a
   loop, a return ending with `<promise>TOKEN</promise>` whose TOKEN names an
   entry in `expect:` also satisfies it — the closing turn of an approval or
   interview loop carries its token rather than a signal line. A `blocked`
   return, or a return matching nothing in `expect:`, halts the run. One
   exception: a return that is a question or an approval request for the
   human is a relay (see below), never a halt.

### `loop:` — repeat until a signal

Holds either a single `agent:`+`prompt:` (a one-step body) or a `steps:` list
(each step an agent step or a `run:` step, same rules as above), plus
`max_iterations: N` and exactly one of:

- `until: SIGNAL` — the loop ends when the **last agent step** of an
  iteration ends its return with `<promise>SIGNAL</promise>`. A token from
  any earlier step is ignored (note it as a warning); this keeps one agent —
  the one the workflow chose — in charge of ending the loop.
- `until_run: "cmd"` — after each full iteration, run the command; exit 0
  ends the loop. Use this form when no agent should be able to end the loop
  by asserting — the command checks reality (a tool's log, a diff), not a
  claim.

Run the body in order; that completes one iteration. Hitting
`max_iterations` without the signal is a **halt, not a success** — that halt
is the escalation.

### `gate:` — human approval

Relay the message verbatim and wait. Approve → continue. Reject → halt as
rejected. Anything else is feedback: record it in your status and re-ask.

### `parallel: true` — start and continue (modifier)

Allowed only on a top-level `run:` or `agent:`+`prompt:` node — never on a
`loop:`, `gate:`, `wait:`, or a step inside a loop. Start the inner step
exactly as you would without the flag, then **immediately continue to the
next node**. Do not wait for the command to exit or the subagent to return.
Track the node as in-flight.

Spawn a parallel agent with whatever your host uses to run a subagent without
holding the walk — Claude Code's Task tool issued without waiting on its
result, Codex's `spawn_agent`, opencode's `task` tool. Start a parallel
`run:` the same way (a background shell if the host has one). If the host
cannot detach, `blocked -> <id>: host cannot run this step in the background`.

A parallel agent that returns a question or an approval is a **halt at
collection**, not a relay: `halted -> <id>: background agent asked the human`.
Parallel is for work that does not need the human.

### `wait:` — collect in-flight work

`wait:` is an id, or a list of ids, each naming a **prior** `parallel: true`
node. Wait until every named in-flight step has returned, then judge each by
the same rules as a foreground `run:` / `agent:` (exit code, `expect:`). Any
failure or `blocked` return halts the run at this wait node — report the
failing id.

A named node skipped via `when:` counts as already done. An id already
collected by an earlier `wait:` is a no-op for that id. An id that is not a
prior `parallel: true` node is `blocked`.

After the last node, collect every still-in-flight parallel node (same
judgment). A run cannot `complete` with in-flight work.

### `when:` — conditional (allowed on any node or step)

Run the `when:` command first: exit 0 → execute the node; non-zero → mark it
skipped and move on. This is the only way a node is skipped — never your own
judgment.

## Working directory

Every node — commands and subagents — runs in the directory the session was
launched from. Start the host in the checkout that should receive the writes
(a worktree, or the current branch).

## Questions and approvals

An agent that returns a question — or a `gate:` — pauses the run: relay it
verbatim to the human, wait, and continue with the answer, re-invoking the
same agent with `{{answer}}` filled where its prompt uses it. Never answer
for the human, never summarize their words — pass them through as given. A
`parallel: true` agent that asks the human is a halt at collection, not a
relay.

## Halts and resuming

On any halt, report per `workflow_lead.md`'s Communication rules: which node,
why, and the agent's own report file where one exists. To resume, the human
relaunches the run: artifacts under `.awc/tasks/<task>/` and committed work
persist, so ask the human which node to resume from, confirm the choice
against what is actually on disk, and continue from that node — never
silently redo completed work that commits, and never re-ask the human
questions an existing artifact already answers.

In-flight `parallel:` work dies with the session. On resume, re-launch any
`parallel: true` node that sits before the resume point and has not yet been
`wait:`ed, unless on-disk artifacts already prove it finished.
