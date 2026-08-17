# Eval fixtures

Tiny target repos the eval prompts point at, tracked as plain files. An eval
run copies a fixture into its run directory and runs `git init && git add -A
&& git commit` in the copy — generated workflows exercise git operations
(worktrees, tags, commits) against it.
