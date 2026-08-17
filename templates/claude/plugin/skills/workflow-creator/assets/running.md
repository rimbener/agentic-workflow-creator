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
| `workdir` | where nodes run once it exists (see Working directory); absent = current branch, in place |
| `nodes` | the run itself — an ordered list, executed top to bottom, one node at a time |

The `nodes:` list **is** the workflow: never reorder, merge, or invent nodes,
and skip one only when its own `when:` says so.

## Placeholders

`{{name}}` names an input or var. Fill it verbatim — never reworded, widened,
or narrowed. Two more exist only inside a loop node's body:

- `{{iteration}}` — the current iteration, starting at 1
- `{{answer}}` — the human's most recent relayed answer inside this node
  (empty on the first iteration)

## Node types

Every node has an `id` and exactly one behavior.

### `run:` — one command

Execute the command in the working directory. Non-zero exit halts the run —
report the node id and the command's output. Commands here are written to
print output only on failure, so output on your screen usually *is* the
failure; quote it, don't summarize it.

### `agent:` + `prompt:` — one agent invocation

1. Read the agent file (`agent:` is a path relative to this folder).
2. Spawn **one** subagent whose prompt is: the agent file's body, then a
   `---` divider, then the node's `prompt:` with placeholders filled. The
   subagent works in the working directory.
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

### `when:` — conditional (allowed on any node or step)

Run the `when:` command first: exit 0 → execute the node; non-zero → mark it
skipped and move on. This is the only way a node is skipped — never your own
judgment.

## Working directory

Without `workdir:`, every node runs where the run was launched — the current
branch, in place. With `workdir:`, every node runs there once it exists; a
node carrying `dir:` runs in that directory instead (that is how the node
that *creates* the workdir runs before it exists).

## Questions and approvals

An agent that returns a question — or a `gate:` — pauses the run: relay it
verbatim to the human, wait, and continue with the answer, re-invoking the
same agent with `{{answer}}` filled where its prompt uses it. Never answer
for the human, never summarize their words — pass them through as given.

## Halts and resuming

On any halt, report per `workflow_lead.md`'s Communication rules: which node,
why, and the agent's own report file where one exists. To resume, the human
relaunches the run: artifacts under `.awc/tasks/<task>/` and committed work
persist, so ask the human which node to resume from, confirm the choice
against what is actually on disk, and continue from that node — never
silently redo completed work that commits, and never re-ask the human
questions an existing artifact already answers.
