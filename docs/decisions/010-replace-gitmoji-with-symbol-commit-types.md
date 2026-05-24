---
status: "accepted"
date: 2026-05-24
decision-makers: ["Alexandre"]
assisted-by: ["github-copilot:claude-sonnet-4.6"]
informed: []
---

# Replace Gitmoji with a Symbol-Based Commit Type Convention

## Table of Contents

* [Context and Problem Statement](#context-and-problem-statement)
  * [Current Architecture Overview](#current-architecture-overview)
  * [Critical Problems Identified](#critical-problems-identified)
  * [Strategic Question](#strategic-question)
* [Decision Drivers](#decision-drivers)
* [Considered Options](#considered-options)
  * [Option 1: Keep Gitmoji](#option-1-keep-gitmoji)
  * [Option 2: Conventional Commits](#option-2-conventional-commits)
  * [Option 3: Symbol-based types with square-bracket scope](#option-3-symbol-based-types-with-square-bracket-scope)
* [Decision Outcome](#decision-outcome)
* [Implementation Details / Status](#implementation-details--status)
  * [Type vocabulary](#type-vocabulary)
  * [Full format specification](#full-format-specification)
  * [Breaking changes](#breaking-changes)
  * [Standards Specification](#standards-specification)
* [References and Related Decisions](#references-and-related-decisions)
* [Changelog](#changelog)

## Context and Problem Statement

### Current Architecture Overview

Since the beginning of the project, commits have followed the
[Gitmoji](https://gitmoji.dev/) convention: each commit subject is prefixed with
a Gitmoji code (e.g. `:sparkles:`, `:bug:`, `:arrow_up:`) followed by a mandatory
scope in parentheses and a colon. The format is enforced by `commitlint` via
`.commitlintrc.js` and validated locally by the Trunk hook `commitlint`.

### Critical Problems Identified

**Emojis never actually render.** The stated benefit of Gitmoji — encoding a change
type in a single visual character — only materialises when the emoji is rendered. In
every context where commits are read most frequently (terminal `git log`, CI output,
email patches, plain-text diffs) the code `:sparkles:` is shown verbatim. The token is
longer than the word it replaces (`feat`) and contributes nothing visually.

**The lexicon is oversized for actual usage.** The `.commitlintrc.js` defines 48 allowed
types. Analysis of the full git history reveals that only 18 have ever been used, and
only 12 more than five times. The remaining 30 types exist but introduce cognitive load
every time a type must be chosen.

**The lexicon works against expressiveness, not for it.** With 48 types, choosing the
right one requires consulting the table — and after choosing, the code still renders as
plain text in the terminal. The expressiveness Gitmoji promises only materialises when
rendered; in practice it adds a decision step without adding signal. This is the opposite
of what a commit type convention should do.

### Strategic Question

How can the commit format be simplified to the point where every type is immediately
recognisable in a one-line `git log`, the full vocabulary fits on a single screen, and
the format remains unambiguous regardless of rendering environment?

## Decision Drivers

* **Functional Requirements**
  * Every commit must carry a type, a mandatory scope, and a subject.
  * Breaking changes must be expressible inline, without relying on the commit body.
  * The format must pass `commitlint` validation on local commit and in CI.
* **Non-Functional Requirements**
  * Types must be scannable at a glance in a terminal `git log --oneline`.
  * Types must be unambiguous — impossible to confuse with the start of a subject line.
  * The vocabulary must be small enough to fit in working memory (\~12 types).
  * Characters must be trivial to type without modifier keys or IME input.
* **Constraints**
  * Renovate-generated commits use the scope `deps`; the type must accommodate automation.
  * The convention replaces Gitmoji end-to-end: `commitlintrc.js`, git-commit skill,
    `AGENTS.md`, and the `create-pr` skill must all be updated atomically.
  * Historical commits do not need to be rewritten.

## Considered Options

### Option 1: Keep Gitmoji

> **Status: REJECTED**

Continue with the existing `:emoji_name:(scope): Subject` format. No changes to
tooling or documentation.

* `+` Zero migration cost
* `+` Tooling already in place and validated
* `-` Emojis never render in the contexts where commits are read most (terminal, CI, email)
* `-` 48-type vocabulary for a repo where 12 types cover 95 % of commits
* `-` `:arrow_up:` is 12 characters; `^` is 1 — the verbosity of the text form defeats
  the stated purpose of visual economy

### Option 2: Conventional Commits

> **Status: REJECTED**

Adopt the industry-standard `type(scope): Subject` format with the Conventional Commits
vocabulary (`feat`, `fix`, `docs`, `chore`, `refactor`, `ci`, `perf`, `revert`, `deps`).

Conventional Commits is widely understood, supported natively by semantic-release,
changelog generators, and most commit tooling. The vocabulary is well-defined and small.

* `+` Industry standard — every developer already knows it
* `+` Native support in semantic-release, commitizen, changelog tools
* `+` `feat`, `fix`, `docs` are unambiguous
* `-` `chore` is a catch-all with no semantic precision — everything that is not a
  feature or a fix tends to fall into it, degrading signal over time
* `-` The `(scope)` delimiter is the same parenthesis used in many other contexts; it
  does not visually pop in a log line
* `-` For a solo personal repo, the industry-standard argument carries little weight:
  there is no team to onboard, no external tooling that consumes commit types, and no
  semantic versioning that depends on `feat` vs `fix`
* `-` `ci` is a scope concern, not a type concern — a CI pipeline change is an addition
  (`+`), a fix (`!`), or a refactor (`=`); conflating type and scope reduces precision

### Option 3: Symbol-based types with square-bracket scope

> **Status: ACCEPTED**

Replace Gitmoji codes with single ASCII symbols. Replace the parenthesis scope delimiter
with square brackets — the natural notation for a list in every programming language,
which makes multi-scope commits (`[scope1,scope2]`) read intuitively rather than as a
hack on a single-value field.

The full format becomes: `type[scope]: Subject`

Each type is a single character (or two for breaking changes — see below). The set of
valid types is chosen to cover the 12 real usage patterns extracted from the git history,
with a wildcard (`*`) for anything that does not fit. Breaking changes append `!` to the
type (`+!`, `~!`, `-!`), which is readable as "plus-bang" or "change-bang" and visually
signals urgency without requiring a separate token.

* `+` Single-character types — maximum information density in `git log --oneline`
* `+` Square brackets visually distinguish the scope from surrounding text, even when the
  scope name itself contains colons (`project:amiya.akn`)
* `+` Vocabulary of 12 types fits in working memory; no lookup table needed after a week
* `+` Breaking change marker is inline and machine-parseable without body inspection
* `+` `!` as a type (bug fix) has intuitive semantics: the exclamation mark signals
  "something was wrong"
* `-` Symbols require a mapping to learn; the meaning of `~` or `=` is not self-evident
  to an external reader unfamiliar with the convention
* `-` Not compatible with any existing tooling out of the box; `commitlintrc.js` must
  be fully rewritten

## Decision Outcome

**Chosen option: "Symbol-based types with square-bracket scope"**, because it is the only
option that delivers on all decision drivers simultaneously. Conventional Commits would
be the right choice for a team or a project with semantic versioning — neither applies
here. Gitmoji's verbosity and rendering problem are fundamental: no configuration change
fixes them. The symbol vocabulary is unfamiliar on first encounter but becomes faster
than any word-based system once internalised, because each type requires exactly one
keystroke.

The `!` suffix for breaking changes trades one symbol (`!` for fix) to gain inline
breaking-change expressibility. This trade-off is acceptable because: (a) bug fixes are
rare in an infrastructure repo where most changes are deliberate additions or bumps, and
(b) a breaking change in a homelab infrastructure repo requires documentation in the body
regardless — the inline marker is a scanning aid, not a substitute for explanation.

***

## Implementation Details / Status

### Type vocabulary

| Type | Meaning                                                         | Replaces                                                      |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `+`  | Add — new feature, service, resource, initial deploy            | `:sparkles:` `:rocket:` `:tada:` `:bricks:`                   |
| `-`  | Remove — delete service, file, dead code                        | `:fire:` `:wastebasket:` `:coffin:`                           |
| `~`  | Improve — perf, config update, behavioral improvement (non-bug) | `:wrench:` `:zap:` `:technologist:`                           |
| `!`  | Fix — repair a bug or broken behavior                           | `:bug:` `:ambulance:` `:adhesive_bandage:` `:rotating_light:` |
| `=`  | No behavior change — refactor, style, tests, DX                 | `:recycle:` `:art:` `:green_heart:` `:building_construction:` |
| `^`  | Bump — dependency version upgrade                               | `:arrow_up:` `:arrow_down:` `:pushpin:`                       |
| `>`  | Move — rename or relocate resources                             | `:truck:`                                                     |
| `<`  | Revert — undo a previous commit                                 | `:rewind:`                                                    |
| `#`  | Docs — ADRs, README, procedures, comments                       | `:memo:` `:bulb:`                                             |
| `$`  | Security — fix, policy, secret management                       | `:lock:` `:closed_lock_with_key:` `:passport_control:`        |
| `?`  | Experiment — POC, investigation, research                       | `:alembic:` `:test_tube:`                                     |
| `*`  | Wildcard — does not fit any other type                          | —                                                             |

### Full format specification

```text
type[!][scope[,scope2]]: Subject starting with uppercase

Body explaining WHY, max 80 chars/line. Mandatory for non-trivial changes.
For breaking changes, body MUST include a BREAKING CHANGE: paragraph.

Assisted-by: <provider>:<model-id>
```

Examples:

```text
+[project:lungmen.akn]: Add Forgejo Git hosting service
^[deps]: cert-manager to v1.16.0
![project:amiya.akn]: Fix OIDC redirect loop after Pocket-Id migration
~[project:amiya.akn,catalog:kustomize]: Tune cert-manager renewal window
=[gh]: Extract base overlays from catalog kustomize
#[gh]: Add ADR-010 documenting commit type convention
```

### Breaking changes

Only addition, improvement, and removal can introduce breaking changes. A bug fix that
breaks something is by definition a structural change, not a fix.

| Valid          | Invalid                                      | Rationale                                                                                            |
| -------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `+!` `~!` `-!` | `!!` `=!` `#!` `?!` `$!` `*!` `^!` `>!` `<!` | Fix, docs, no-behavior-change, experiment, security, bump, move, revert cannot be breaking by nature |

Breaking change commits **must** include a `BREAKING CHANGE:` paragraph in the body
explaining what breaks and how to migrate.

```text
~![project:amiya.akn]: Drop Authelia in favor of Pocket-Id native OIDC

Authelia introduced operational overhead with its LDAP dependency.
Pocket-Id covers the same OIDC use cases natively.

BREAKING CHANGE: All services relying on Authelia OIDC endpoints must
update their client_id and redirect URIs before this commit is deployed.

Assisted-by: github-copilot:claude-sonnet-4.6
```

### Standards Specification

* **Scope delimiter**: `[` `]` (square brackets)
* **Multiple scopes**: comma-separated inside brackets, no spaces: `[scope1,scope2]`
* **Breaking change marker**: `!` immediately after the type, before `[`: `+![scope]:`
* **Subject**: sentence-case (uppercase first letter), imperative mood, no trailing period,
  max 100 characters
* **Body**: mandatory for all non-trivial changes; explains WHY, not WHAT; 80 chars/line
* **Breaking change body**: mandatory `BREAKING CHANGE:` paragraph when `!` is used
* **Trailer**: `Assisted-by: <provider>:<model-id>` when AI assistance was used
* **Signing**: GPG-signed (`-S`); `Signed-off-by` (`-s`) is the human committer's
  responsibility — agents must not add it

***

## References and Related Decisions

* **Commit config**: `.commitlintrc.js` — authoritative list of types and scopes
* **Commit skill**: `.agents/skills/git-commit/SKILL.md` — authoring workflow for agents
* [Gitmoji](https://gitmoji.dev/) — previous convention
* [Conventional Commits](https://www.conventionalcommits.org/) — considered alternative
* [git log emoji usage analysis](https://github.com/chezmoidotsh/arcane) — `git log --oneline --no-merges | grep -oE ':[a-z_]+:' | sort | uniq -c | sort -rn`

***

## Changelog

* **2026-05-24**: **FEATURE**: Initial ADR documenting the replacement of Gitmoji with
  a symbol-based commit type convention.
