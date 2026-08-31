This session was started by `awc --upgrade` (agentic-workflow-creator). The `workflow-upgrader` skill from the awc plugin is loaded, along with the `/awc-status` command. The `workflow-creator` skill is loaded too — the upgrader reads the dialect and the agent bases from it, and it is there if this turns out to be a new workflow after all.

Briefly greet the user, then ask which existing workflow package they want to change and what should change about it, and use the workflow-upgrader skill to guide the process.
