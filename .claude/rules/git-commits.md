# Git Commit Rules for Arcane Infrastructure Project

Comprehensive guidelines for creating standardized Git commits in the Arcane multi-cluster infrastructure project.

## Non-negotiable Rules (Critical)

### Mandatory commit format

* **ALWAYS** use exact format: `emoji(scope): Description` with required signoff
* **ALWAYS** use signoff (-s) and GPG signature (-S) flags for security and authenticity
* **NEVER** auto-update GitHub issues - always ask for user confirmation first
* **NEVER** make assumptions - ask for missing information rather than guessing
* **NEVER** add "Generated with Claude Code" or similar AI generation disclaimers in commit messages - use Co-authored-by trailer instead

**Valid examples:**

* `:sparkles:(project:amiya.akn): Add new monitoring dashboard`
* `:bug:(catalog:fluxcd): Fix cert-manager helm values`
* `:memo:(project:lungmen.akn): Add bootstrap documentation`

**Invalid examples:**

* `add new dashboard` (missing emoji and scope)
* `:sparkles: (project:amiya.akn): Add dashboard` (invalid space)
* `git commit -m ":sparkles:(project:amiya.akn): add dashboard"` (missing signoff -s and GPG -S)

### Complete Gitmoji semantic emojis

Use Gitmoji semantic emojis synchronized with `.commitlintrc.js`:

**Core Development:**

* `:sparkles:` - Introduce new features
* `:bug:` - Fix a bug
* `:memo:` - Add or update documentation
* `:art:` - Improve structure/format of code
* `:recycle:` - Refactor code

**Infrastructure & Configuration:**

* `:bricks:` - Infrastructure related changes
* `:wrench:` - Add or update configuration files
* `:rocket:` - Deploy stuff
* `:building_construction:` - Make architectural changes

**Dependencies & Updates:**

* `:arrow_up:` - Upgrade dependencies
* `:arrow_down:` - Downgrade dependencies
* `:heavy_plus_sign:` - Add a dependency
* `:heavy_minus_sign:` - Remove a dependency
* `:pushpin:` - Pin dependencies to specific versions

**Security & Emergency:**

* `:lock:` - Fix security or privacy issues
* `:ambulance:` - Critical hotfix
* `:closed_lock_with_key:` - Add or update secrets
* `:passport_control:` - Work on authorization, roles and permissions

**CI/CD & DevOps:**

* `:green_heart:` - Fix CI Build
* `:construction_worker:` - Add or update CI build system
* `:technologist:` - Improve developer experience
* `:hammer:` - Add or update development scripts

**Project & Release Management:**

* `:tada:` - Begin a project
* `:bookmark:` - Release/Version tags
* `:boom:` - Introduce breaking changes
* `:rewind:` - Revert changes

**Code Quality & Maintenance:**

* `:zap:` - Improve performance
* `:fire:` - Remove code or files
* `:coffin:` - Remove dead code
* `:wastebasket:` - Deprecate code that needs cleanup
* `:rotating_light:` - Fix compiler/linter warnings
* `:adhesive_bandage:` - Simple fix for non-critical issue
* `:pencil2:` - Fix typos

**Testing & Validation:**

* `:white_check_mark:` - Add, update or pass tests
* `:test_tube:` - Add a failing test
* `:safety_vest:` - Add or update validation
* `:stethoscope:` - Add or update healthcheck

**Assets & Resources:**

* `:bento:` - Add or update assets
* `:truck:` - Move or rename resources
* `:package:` - Add or update compiled files or packages
* `:lipstick:` - Add or update UI and style files

**Documentation & Metadata:**

* `:bulb:` - Add or update comments in source code
* `:page_facing_up:` - Add or update license
* `:see_no_evil:` - Add or update .gitignore file
* `:label:` - Add or update types

**Advanced & Experimental:**

* `:alembic:` - Perform experiments (POCs, architecture testing, validation)
* `:alien:` - Update code due to external API changes
* `:twisted_rightwards_arrows:` - Merge branches

### Exact scopes (synchronized with .commitlintrc.js)

Use exact scope format based on `.commitlintrc.js`. When scope is ambiguous, analyze project structure and propose appropriate scope with user validation.

**Catalog Scopes:**

* `catalog:ansible` - Ansible role catalog (for `catalog/ansible/`)
* `catalog:crossplane` - Crossplane resource catalog (for `catalog/crossplane/`)
* `catalog:flakes` - Nix flakes catalog (for `catalog/flakes/`)
* `catalog:kustomize` - Kustomize component catalog (for `catalog/kustomize/`)
* `catalog:kairos-bundle` - Kairos bundle catalog (for `catalog/kairos-bundles/`)
* `catalog:talos` - Talos manifests catalog (for `catalog/talos/`)

**Catalog scope examples:**

* ✅ `:sparkles:(catalog:ansible): Add new PVE cluster provisioning role`
* ✅ `:wrench:(catalog:crossplane): Update AWS provider configuration`
* ✅ `:arrow_up:(catalog:flakes): Update chezmoi.sh yaldap flake dependencies`
* ✅ `:bento:(catalog:talos): Add new talos machine configuration`
* ❌ `:sparkles:(ansible): Add new role` (missing catalog: prefix)
* ❌ `:wrench:(catalog): Update configuration` (too generic)

**Project Scopes:**

* `project:amiya.akn` - Amiya.akn project (for `projects/amiya.akn/`)
* `project:chezmoi.sh` - Chezmoi.sh project (for `projects/chezmoi.sh/`)
* `project:hass` - Home Assistant project (for `projects/hass/`)
* `project:lungmen.akn` - Lungmen.akn project (for `projects/lungmen.akn/`)
* `project:maison` - Maison project (for `projects/maison/`)
* `project:shodan.akn` - Shodan.akn project (for `projects/shodan.akn/`)

**Project scope examples:**

* ✅ `:sparkles:(project:amiya.akn): Add prometheus servicemonitor for api metrics`
* ✅ `:wrench:(project:chezmoi.sh): Update crossplane AWS provider configuration`
* ✅ `:lock:(project:hass): Tighten cloudflare IAM permissions`
* ✅ `:memo:(project:lungmen.akn): Add cluster migration documentation`
* ❌ `:sparkles:(amiya.akn): Add kubernetes manifests` (missing project: prefix)
* ❌ `:memo:(project:amiya): Update documentation` (incorrect project name)

**Repository Scopes:**

* `gh` - GitHub workflows/CI/repository files (for `.github/`, root config, README, LICENSE)
* `deps` - Dependency updates (automated or manual)

**Repository scope examples:**

* ✅ `:green_heart:(gh): Fix renovate workflow permissions`
* ✅ `:wrench:(gh): Update issue templates`
* ✅ `:see_no_evil:(gh): Update gitignore for IDE files`
* ✅ `:arrow_up:(deps): Update helm release argo-cd to v8.1.0`
* ❌ `:wrench:(gh:workflows): Update configuration` (too specific)

## Important Rules

### Atomic commits (Critical)

* **Create atomic commits** - one logical change per commit
* **Allow multiple scopes only** when change affects multiple components atomically
* **Multiple scopes format**: `scope1,scope2,scope3` (comma-separated, no spaces)
* **Maximum recommended**: 3 scopes per commit

**Valid multiple scope examples:**

* ✅ `:sparkles:(project:amiya.akn,project:maison): Add shared monitoring stack integration` (cross-project functional change)
* ✅ `:arrow_up:(catalog:fluxcd,catalog:kustomize): Update cert-manager to v1.15.0` (infrastructure change affecting multiple catalogs)
* ✅ `:boom:(catalog:crossplane,project:chezmoi.sh): Migrate to crossplane v1.15 provider format` (coordinated breaking change)

**Invalid multiple scope examples:**

* ❌ `:memo:(project:amiya.akn,catalog:ansible): Update docs and roles` (unrelated changes)
* ❌ `:wrench:(project:amiya.akn,catalog:fluxcd): Fix config and add new feature` (separate changes)

**When to use multiple scopes:**

* Updating shared component used by multiple projects
* Breaking change requiring coordinated updates
* Dependency change affecting multiple components atomically
* Single infrastructure change with multiple valid impacts

### Description (Critical)

* **Start with UPPERCASE**, use imperative present tense, **no final period**
* **Max 100 characters** (per commitlint configuration)
* **Body mandatory** for all non-trivial changes explaining why and impact
* **Max 80 characters per line** in body

### Body Content Rules (Critical)

* **Start each sentence with UPPERCASE** (sentence-case format per .commitlintrc.js)
* **Explain the WHY, not the WHAT** - focus on reasoning and impact
* **Use complete sentences** - proper grammar and punctuation
* **Include context** - what problem this solves, what impact it has
* **Mention affected systems** - which services, users, or processes are impacted
* **Reference external resources** when relevant (docs, GitHub issues, PRs)
* **NEVER use subjective judgments** - avoid "comprehensive", "complete", "enhanced", "improved", "better", "great", etc.
* **Use objective facts only** - state requirements, limitations, technical reasons

### AI Co-Author Attribution (Mandatory)

* **Always include Co-authored-by trailer** for all commits when using AI assistance
* **Use standardized AI attribution format** for consistency and traceability
* **Essential for transparency** and proper attribution of AI contributions
* **NEVER use alternative AI attribution** - avoid "Generated with Claude Code", "AI-generated", or similar disclaimers in commit message body
* **Co-authored-by is the ONLY acceptable AI attribution method** - it's standard, clean, and properly tracks AI contribution

**Standard AI Co-author format:**

```
Co-authored-by: Claude <claude@anthropic.com>
```

**AI Co-author with model info (preferred when known):**

```
Co-authored-by: Claude (Sonnet-3.5) <claude@anthropic.com>
```

**Invalid AI attribution examples:**

```
❌ "Generated with Claude Code assistance"
❌ "AI-generated commit with Claude"
❌ "Created with AI assistance"
❌ "Note: This commit was generated with AI help"
```

**Valid AI attribution (only method):**

```
✅ Co-authored-by: Claude <claude@anthropic.com>
```

**Body format example with AI Co-author:**

```bash
git commit -S -s -m ":wrench:(k8s:cert-manager): Increase renewal threshold to 15 days" \
-m "Previous threshold of 7 days was causing unnecessary certificate" \
-m "renewals and putting load on Let's Encrypt rate limits." \
-m "This change reduces renewal frequency while maintaining security." \
-m "" \
-m "Impact: Reduces API calls to Let's Encrypt by ~60% while keeping" \
-m "certificates renewed well before expiration." \
-m "" \
-m "Co-authored-by: Claude <claude@anthropic.com>"
```

**Body content examples:**

**Good body content (explains WHY):**

```
✅ "ADR-006 requires validation of Option 5 architecture before
final decision on homelab external access strategy.
Current Tailscale Funnel approach has HTTP/HTTPS-only
limitations that prevent TCP service exposure.

This POC enables testing of edge-based security enforcement
with Cloudflare Workers while maintaining IP privacy and
zero-trust principles."
```

**Bad body content (explains WHAT or uses judgments):**

```
❌ "adds comprehensive prometheus servicemonitor for api metrics endpoint"
(lowercase start, explains WHAT not WHY, uses subjective judgment "comprehensive")

❌ "Creates a complete implementation guide with enhanced testing framework"
(subjective judgments: "complete", "enhanced")

❌ "Implements proof of concept with comprehensive documentation and improved architecture"
(multiple subjective judgments, focuses on WHAT instead of WHY)
```

### Consistency and workflow (Critical)

* **Reference last 10 commits** to maintain consistency with project conventions
* **Ask for missing information** rather than making assumptions
* **Analyze project structure** and propose appropriate scope with user validation if ambiguous
* **Validate against .commitlintrc.js** configuration during creation

### Synchronization with .commitlintrc.js (Critical)

* **When `.commitlintrc.js` is modified**, detect changes and propose rule update
* **Validate new type/scope** against current configuration before use
* **Synchronize allowed emojis and scopes** with configuration

### Branch naming

* **Issue format**: `issue-123/description` when working on GitHub issues
* **Functional format**: `feat/description`, `fix/description`, `docs/description`
* **Valid examples**: `issue-456/add-monitoring-dashboard`, `feat/new-lungmen-project`, `docs/update-bootstrap-guide`
* **Avoid generic names**: ❌ `feature/updates`, ❌ `fix/stuff`

## Complete Examples

### Adding new Kubernetes resource (AI-assisted)

```bash
git commit -S -s -m ":sparkles:(project:amiya.akn): Add prometheus servicemonitor for api metrics" \
-m "Enables monitoring of API response times and error rates through" \
-m "the existing Prometheus stack. ServiceMonitor targets the API" \
-m "service on port 8080/metrics endpoint." \
-m "" \
-m "This provides visibility into API performance and supports" \
-m "the alerting rules defined in the monitoring stack." \
-m "" \
-m "Co-authored-by: Claude <claude@anthropic.com>"
```

### Infrastructure bug fix

```bash
git commit -S -s -m ":bug:(k8s:cert-manager): Fix wildcard certificate renewal issue" \
-m "ClusterIssuer was incorrectly configured with HTTP01 challenge" \
-m "for wildcard certificates, which is not supported by Let's Encrypt." \
-m "Changed to DNS01 challenge using Cloudflare DNS provider." \
-m "" \
-m "This resolves the certificate renewal failures that were causing" \
-m "HTTPS outages for *.amiya.akn services."
```

### Dependency update

```bash
git commit -S -s -m ":arrow_up:(deps): Update helm release argo-cd to v8.1.0" \
-m "Automated update from Renovate bot." \
-m "" \
-m "Changes include:" \
-m "- Improved RBAC management" \
-m "- Enhanced security policies" \
-m "- Bug fixes for ApplicationSet controller"
```

## Scope Decision Tree

### Step 1: Analyze modified file paths

```
Are you modifying files in projects/[project-name]/ ?
├─ YES → Use scope: project:[project-name]
│   ├─ Available projects:
│   │   - project:amiya.akn, project:chezmoi.sh, project:hass
│   │   - project:lungmen.akn, project:maison, project:shodan.akn
│   └─ Multiple projects → project:name1,project:name2 (if atomic logical change)
│
└─ NO → Continue step 2
```

### Step 2: Check catalogs

```
Are you modifying catalog/ files?
├─ YES → Use scope: catalog:[type]
│   ├─ Available catalogs:
│   │   - catalog:ansible (catalog/ansible/)
│   │   - catalog:crossplane (catalog/crossplane/)
│   │   - catalog:flakes (catalog/flakes/)
│   │   - catalog:kustomize (catalog/kustomize/)
│   │   - catalog:kairos-bundle (catalog/kairos-bundles/)
│   │   - catalog:talos (catalog/talos/)
│   └─ Multiple catalogs → catalog:type1,catalog:type2 (if atomic change)
│
└─ NO → Continue step 3
```

### Step 3: Check repository/GitHub

```
Are you modifying .github/, CI workflows, or root repository files?
├─ YES → Use scope: gh
│   ├─ Includes: .github/workflows/, .github/*, README, LICENSE, .gitignore
│   └─ Root config: .commitlintrc.js, package.json, etc.
│
└─ NO → Use scope: deps (if dependencies) or ask user for clarification
```

### Multiple scope validation

```
Does the change affect multiple components with single logical purpose?
├─ YES → Multiple scopes allowed
│   ├─ Valid examples:
│   │   - project:amiya.akn,project:maison (shared infrastructure)
│   │   - catalog:fluxcd,catalog:kustomize (dependency update)
│   │   - catalog:ansible,catalog:crossplane (Kubernetes version)
│   │   - project:chezmoi.sh,catalog:crossplane (Crossplane provider)
│   ├─ Format: scope1,scope2,scope3 (commas, no spaces)
│   └─ Maximum: 3 scopes per commit
│
└─ NO → Use single scope or split into separate commits
```

## Validation Regex Patterns

**Commit message**: `^:[a-z_]+:\([^)]+\): [A-Z][^.]{0,98}$`

* ✅ `:sparkles:(project:amiya.akn): Add new monitoring dashboard`
* ❌ `:sparkles: (project:amiya.akn): Add new monitoring dashboard` (invalid space)

**Branch naming**: `^(feat|fix|docs|chore|refactor)/[a-z0-9-]+$|^issue-\d+/[a-z0-9-]+$`

* ✅ `feat/new-lungmen-project`, `issue-456/add-monitoring-dashboard`

## Complete Commit Structure Schema

```
Commit Message Structure:
:emoji:(scope[,scope2,...]): Description

[mandatory body for non-trivial changes - max 80 chars per line]

[optional footer - GitHub issue refs, breaking changes, co-authors]

Required Elements:
- emoji: Gitmoji semantic emoji (complete list from .commitlintrc.js)
- scope: change context (exact scopes from .commitlintrc.js)
- description: UPPERCASE start, imperative, no period, max 100 chars
- body: explain WHY and impact for non-trivial changes
- signoff: always use -s flag (enforced by commitlint)
- GPG signature: always use -S flag

Footer Elements:
- Co-authored-by: Always include for AI-assisted commits (mandatory)
- GitHub issue references: Link to relevant issues (optional) - e.g., "Closes #123", "Fixes #456"
- Breaking changes: BREAKING CHANGE: description (when applicable)

Body Structure:
- Max 80 characters per line
- Start each sentence with UPPERCASE (sentence-case per .commitlintrc.js)
- Explain the WHY, not the WHAT
- Include context and problem solved
- Mention affected systems/services
- Impact and consequences
- References if applicable (docs, GitHub issues, PRs)

Command format:
git commit -S -s -m ":emoji:(scope): Description" \
-m "body line 1" \
-m "body line 2" \
-m "body line 3" \
-m "" \
-m "Co-authored-by: Claude <claude@anthropic.com>"
```

## Commit Tool Preference

### Tool Priority Order

1. **MCP-based commit tools** - Best integration with AI workflows
2. **Internal/Platform tooling** - IDE integrations, platform-specific helpers
3. **Direct git commands** - Fallback when integrated tools unavailable

### Why prefer integrated tools?

* **Better AI context** - Tools understand AI assistance context
* **Automated attribution** - Can auto-add Co-authored-by trailers
* **Validation integration** - Built-in format and rule checking
* **User experience** - Smoother workflow for AI-assisted development

## Detailed Complete Workflow

### 1. Analyze changes and context (Critical)

```bash
git status
git diff --cached --name-only
git log --oneline --no-merges -10
```

**Validation**: Understand which components/projects are affected

### 2. Determine scope(s) and emoji (Critical)

* Review file paths to determine scope using decision tree
* Check if changes affect multiple components with single logical purpose
* Validate scopes against .commitlintrc.js configuration
* Format multiple scopes as comma-separated (no spaces): scope1,scope2
* Analyze change type to select appropriate Gitmoji emoji
* If scope ambiguous, propose options and ask user
* Ensure consistency with recent commit patterns

**Validation**: Confirm scope(s) and emoji match actual changes and are valid per .commitlintrc.js

### 3. Create atomic commits (High)

```bash
git add [specific files]
# Separate changes affecting different projects/components
```

**Validation**: Single logical change per commit

### 4. Format commit message (Critical)

* Write clear, imperative description (UPPERCASE start, no period)
* Add explanatory body for non-trivial changes
* Include references if applicable (GitHub issues, PRs)

**Validation**: Message follows format and provides sufficient context

### 5. Sign and commit (Critical)

**Preferred approach: Use integrated commit tools when available**

* **MCP commit tools** (if available) - better AI integration
* **Internal tooling** - platform-specific commit helpers
* **IDE integrations** - VS Code, cursor, etc.

**Fallback: Direct git commands**

```bash
git commit -S -s -m "emoji(scope): Description" -m "body line 1" -m "body line 2" \
-m "" -m "Co-authored-by: Claude <claude@anthropic.com>"
```

**Validation**: Commit properly signed and formatted with mandatory AI Co-author attribution

### 6. Verify and push (High)

```bash
git show --show-signature
git push origin [branch-name]
```

**Validation**: Commit appears correctly in log with signatures

## Pre-commit Checklist

* [ ] **Critical**: Choose semantic emoji matching change type
* [ ] **Critical**: Use correct scope format based on file location
* [ ] **Critical**: Description UPPERCASE start, imperative, no period
* [ ] **Critical**: Single logical change per commit
* [ ] **Critical**: Include explanatory body for non-trivial changes
* [ ] **Critical**: Use both signoff (-s) AND GPG signature (-S)
* [ ] **Critical**: Validate scope with user if ambiguous
* [ ] **Critical**: Check recent commits for consistency
* [ ] **Critical**: Never auto-update GitHub issues without confirmation
* [ ] **Critical**: Always include AI Co-authored-by trailer for traceability
* [ ] **Critical**: Never add "Generated with Claude Code" or similar disclaimers - Co-authored-by is sufficient
* [ ] **Critical**: Body explains WHY (problem, requirement, limitation) not WHAT (implementation details)
* [ ] **Critical**: Never use subjective judgments - avoid "comprehensive", "complete", "enhanced", "improved", etc.
* [ ] **Recommended**: Use integrated commit tools over raw git commands when available

## Quick Reference Commands

| Action                      | Command                                                                                                                                                                                                                                                                                          | Description                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Check recent commits**    | `git log --oneline --no-merges -10`                                                                                                                                                                                                                                                              | Review recent commit patterns for consistency                                  |
| **Signed commit with body** | `git commit -S -s -m ":sparkles:(project:amiya.akn): Add monitoring dashboard" \`<br/>`-m "Provides real-time metrics for cluster health and application" \`<br/>`-m "performance. Integrates with existing Prometheus stack." \`<br/>`-m "" -m "Co-authored-by: Claude <claude@anthropic.com>"` | Create properly signed commit with explanatory body and mandatory AI co-author |
| **Analyze staged files**    | `git diff --cached --name-only`                                                                                                                                                                                                                                                                  | Review staged files to determine appropriate scope                             |
| **Atomic staging**          | `git add path/to/specific/files`                                                                                                                                                                                                                                                                 | Stage only files related to single logical change                              |
| **Commit verification**     | `git show --show-signature`                                                                                                                                                                                                                                                                      | Verify last commit has proper signatures                                       |
