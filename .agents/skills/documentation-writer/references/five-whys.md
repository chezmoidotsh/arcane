# 5 Whys

The default root-cause technique for most post-mortems. Ask "why" five times, each time drilling from symptom toward
systemic condition.

## Two rules

1. **Each answer must point to a specific, identifiable thing** — not "things were complex" or "we were busy." A
   process, a missing role, an outdated criterion, a gap in tooling.
2. **Stop when the fix is actionable** — if you reach "that's just how it is" or "human nature," you went too deep or
   took a wrong branch. Back up and try a different angle.

## Bad vs Good

**Bad** (circular, ends in "that's just how it is"):

- Why did we miss revenue? Deals slipped. → Why? Longer sales cycle. → Why? Enterprise is complex. → Why? That's
  enterprise. → **Nothing to do.**

**Good — business** (reaches a specific, fixable condition):

- Why did we miss revenue? Three deals slipped. → Why? No champion with budget authority identified. → Why?
  Qualification criteria didn't require it. → Why? Criteria built 8 months ago for SMB, not updated. → Why? No owner, no
  review process. → **Fix: assign owner, add quarterly review.**

**Good — infrastructure** (reaches a missing control):

- Why did the deploy degrade service for 47 minutes? Pods entered CrashLoopBackOff. → Why? A required secret was
  missing. → Why? The secret was provisioned by a separate workflow that ran after the deploy, not before. → Why? The
  deploy pipeline has no pre-flight check for required secrets. → Why? No one owns the deploy checklist; it hasn't been
  updated since the secrets model changed. → **Fix: add pre-deploy secret existence check; assign checklist ownership.**

## Common failure modes

- **Blame branch** — "Why did the deploy fail? Because Sarah pushed bad code." This assigns fault without understanding
  the system. Redirect: "Why was bad code able to reach production?" (missing tests? no code review? CI gap? pressure to
  ship?)
- **Circular chain** — "Why? X. Why X? Because Y. Why Y? Because X." Break the loop by broadening the question: "What
  structural condition made both X and Y possible?"
- **External attribution** — "Why? The client changed requirements." Valid out-of-control factor, but not a root cause.
  Pivot to: "Why weren't we resilient to requirement changes?"

## When to use

- Single linear cause chain — most post-mortems
- Quick first pass before deciding if a deeper technique is needed
- When 5 Whys keeps looping or hitting dead ends, switch to Ishikawa or Swiss Cheese

## See also

- `ishikawa.md` — when the cause spans multiple domains or the chain dead-ends
- `swiss-cheese-model.md` — when multiple layers all failed simultaneously
- `../SKILL.md` — technique selection table and full workflow
