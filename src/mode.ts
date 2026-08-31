// Which skill a session opens in. `awc <agent>` starts on workflow-creator;
// `awc <agent> --upgrade` starts on workflow-upgrader; `awc <agent> --edit`
// starts on workflow-editor. The upgrader and the editor are deliberately
// separate skills — the upgrader owns the inventory-and-audit walk and grows
// its own functionality, the editor applies changes the user has already
// decided — and they never ship together: each mode stages exactly one
// change skill (or, for create, none), because an extra change skill is an
// extra trigger competing for the model's attention. Everything else in
// templates/shared/skills/ — the grill aids, and the creator per the next
// paragraph — ships in every mode.
//
// The creator ships in every mode: both change skills read the dialect, the
// agent bases and the validation checklist from `../workflow-creator/`, and
// every host stages skills as flat siblings, so those paths only resolve
// while the creator's directory is there beside them.
export type Mode = 'create' | 'upgrade' | 'edit'

const SKIP: Record<Mode, string[]> = {
  create: ['workflow-upgrader', 'workflow-editor'],
  upgrade: ['workflow-editor'],
  edit: ['workflow-upgrader'],
}

const PROMPT: Record<Mode, string> = {
  create: 'prompt.md',
  upgrade: 'prompt-upgrade.md',
  edit: 'prompt-edit.md',
}

// Takes the parsed flags as named fields rather than positional booleans, so
// a swapped pair of arguments cannot silently pick the wrong session. parseCli
// rejects `--upgrade --edit`, so at most one flag arrives true.
export function mode(flags: { upgrade: boolean; edit: boolean }): Mode {
  if (flags.upgrade) return 'upgrade'
  if (flags.edit) return 'edit'
  return 'create'
}

// Skill directory names the payload leaves out for this mode.
export function skipSkills(mode: Mode): string[] {
  return SKIP[mode]
}

export function promptFile(mode: Mode): string {
  return PROMPT[mode]
}
