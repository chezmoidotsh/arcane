---
name: auto-file-bug
description: >
  Files a GitHub issue autonomously — no confirmation, no waiting for the user to ask — when work on one task surfaces a
  second, unrelated bug that is evidenced (not suspected) and serious enough that recurrence would cause real harm (an
  outage, data loss, a security exposure, a silent correctness bug), but fixing it now is out of scope for the current
  change. Use this skill whenever you catch yourself about to write "this deserves its own issue" or "we should also
  look at X later" as a one-line mention and then move on — that mention should become a filed issue instead, not a
  dropped thought. Delegates the actual drafting (duplicate check, title, labels, body) to a fresh subagent running the
  `create-issue` skill, so the investigation stays off the main conversation thread.
---

# Arcane Auto-File-Bug Skill

## Why this exists

Work on one task regularly surfaces a second, real problem — a latent bug, a tooling gap, a config that would bite again
— that has nothing to do with what was asked. `create-issue`'s own triggers already cover "you'd otherwise say 'this
deserves its own issue'". This skill covers a narrower, higher-bar case: bugs serious enough that waiting for the user
to notice and ask isn't good enough, but not serious enough to justify expanding or blocking the current task. For
those, file the issue autonomously — don't just mention it and move on, and don't interrupt the user to ask permission
first.

The concrete case that prompted this skill: while deploying PR #1147, its `update-policy` change took `bind.service`
down on `talosnet-dns` for ~8 minutes. The immediate break got fixed forward in PR #1148. But the tooling gap that let a
build with a failed systemd unit reach production anyway — `.mise/lib/lxc.sh`'s upgrade smoke-test logs failed units
without checking them — was a second, independent bug. It didn't block finishing the fix, and it wasn't something to
silently drop either. That became issue #1149.

## When to auto-file (all of these must hold)

1. **It's evidenced, not suspected.** You have a concrete symptom: an error string, a log line, a reproducible
   condition, exact file/line references. "This looks fragile" is not enough.
2. **Recurrence would cause real harm.** An outage, data loss, a security exposure, a silent correctness bug — not
   "could be nicer" or "not idiomatic".
3. **Fixing it now is out of scope.** Doing it immediately would expand or derail the current task the same way
   `create-issue`'s own guidance already rules out. If it's a one-line fix that doesn't touch anything else, just fix it
   instead of filing anything.
4. **You already have what you need to write it.** No further investigation required — if you'd need to go spelunking to
   confirm root cause, that's a bigger ask than "file an issue", surface it to the user instead.

Skip auto-filing (mention it inline instead, or just fix it) when:

- It's a style/lint nitpick.
- It's speculative with no observed failure mode.
- It's small enough that a one-line mention to the user in the current response is strictly better than a tracker entry
  — reserve autonomous filing for things where the severity justifies not waiting on a reply.

## Workflow

1. **Don't draft the issue in the current context.** Drafting a good issue (duplicate check, title, labels, a body that
   stands alone) costs real context; the point of delegating is keeping that off the main thread.
2. **Dispatch a fresh subagent** via the `Agent` tool — plain `general-purpose` (or `claude`), not `fork`. A fork
   inherits this whole conversation's context, which defeats the purpose here; a fresh agent starts clean and only gets
   what you hand it.
3. **Hand it a self-contained brief**, not a pointer back to "see above". A subagent with no conversation history needs
   everything spelled out. Include:
   - The exact symptom (error text, log excerpt, command output).
   - Root cause, if known, with file:line references.
   - Why this isn't being fixed in the current change (one sentence).
   - Any related PR/issue numbers to cross-link.
   - A suggested title, Issue Type, and scope label if you already have a clear read — the subagent should still apply
     its own judgment, not blindly copy these.
4. **Instruct the subagent explicitly to use the `create-issue` skill** so title format, labels, and body structure
   follow repo convention, including its duplicate-check step.
5. **Report back in one line** once the subagent returns — `Filed issue #N: <title>` — and continue whatever you were
   doing before. Don't re-explain the bug, don't ask whether the issue was wanted; the decision to file was already made
   per this skill's criteria.

## Subagent prompt template

```text
Use the create-issue skill to file a GitHub issue for a bug found while working on <current task/PR>.
Do not ask me anything — draft it and create it directly, following the skill's title/label/body rules.

Symptom: <exact error text / log excerpt / observed behavior>
Root cause: <what's actually wrong, with file:line references, or "unknown" if not diagnosed>
Why not fixed now: <one sentence — out of scope / too large / not blocking>
Related: <PR/issue numbers>
Suggested title: <sentence-form title, or leave to your judgment>
Suggested labels: <Issue Type + scope label, if known>

Check for duplicates first. Report back the issue number and title when done.
```

## Non-goals

- This does not change when to _propose_ an issue for things that don't meet the severity bar — that stays a same-turn
  mention to the user, per `AGENTS.md`'s scope-management guidance.
- This does not authorize fixing the bug itself outside the current task's scope — filing the issue is the entire
  action; the fix is separate, future work.

## References

- `.agents/skills/create-issue/SKILL.md` — the actual issue-drafting rules this skill delegates to.
- Precedent: PR #1147/#1148 (incident + fix) and issue #1149 (the deferred tooling gap).
