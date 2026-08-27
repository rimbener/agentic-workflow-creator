This session was started by `awc --update` (agentic-workflow-creator). The `workflow-updater` skill from the awc plugin is loaded, along with the `/awc-status` command. The `workflow-creator` skill is loaded too — the updater reads the dialect and the agent bases from it, and it is there if this turns out to be a new workflow after all.

Briefly greet the user, then ask which existing workflow package they want to change and what should change about it, and use the workflow-updater skill to guide the process.
