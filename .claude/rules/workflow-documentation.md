# AI Collaborative Workflow Documentation

Guidelines for maintaining session documentation during collaborative work between user and AI, enabling context preservation and project tracking.

## Critical Rules (Non-negotiable)

### Session documentation creation

* **Always** create and maintain session documentation in `.claude/sessions/` with date-prefixed naming (`YYYYMMDD-description.md`) for any significant collaborative work
* **Always** ask user permission before creating a new session document and explain why it's necessary
* **Never** create GitHub issues, PRs, or delete session documents without explicit user authorization

### Permission management

* Ask permission before attempting to resolve unclear thoughts or questions, and request time allocation for investigation
* Propose GitHub issue creation when discovering bugs or features unrelated to current project, or when project becomes too large for single scope

## Standardized Document Structure

### Session document template

```markdown
# [Project Title - Clear, concise objective]

## 🎯 Objective
[Concise description of project goal - what we're trying to achieve]

## 🧠 Context & Reflections
[AI internal thoughts, questions, hesitations, observations]
[Decision-making process and reasoning]
[Alternative approaches considered]
[Unclear points requiring investigation]

## 📝 Change History
[Chronological log of significant actions]
[Format: - Action description]
[Technical changes, decisions made, discoveries]

## ⚠️ Attention Points
[Issues, risks, blockers identified]
[Decisions pending user input]
[Potential conflicts or problems]

## 🔄 Next Steps
[TODO items with checkbox format]
[- [ ] Action description]
[Prioritized next actions]
```

### Optional sections based on context

```markdown
## 🔗 References
[Links to relevant documentation, GitHub issues, external resources]

## 📊 Progress
[Progress tracking for larger projects]
[Milestones and completion status]
```

## Management Rules

### Context maintenance

* Document internal thoughts, questions, hesitations and decision-making processes to enable better AI context understanding
* Automatically update session document when context changes significantly, technical decisions are made, or important information emerges
* Periodically re-read session document to maintain context continuity - when losing track of project state or approximately every 15±5 exchanges depending on complexity

### Project management

* Provide regular project status updates and alert when work deviates from stated objective
* Clean up session documents after PR merge, asking user confirmation before deletion

## Concrete Examples

### Session creation request

```
AI: "I think we're starting a significant new project (monitoring addition). 
May I create a session document `20250128-add-monitoring-dashboard.md` 
to track our work and maintain context?"
User: "Yes, go ahead"
```

### Investigation request

```
AI: "I've documented a question about metrics backup strategy. 
May I take a few minutes to investigate the options (retention policies, 
external storage) before continuing?"
```

### Issue creation proposal

```
AI: "While working on monitoring, I discovered a bug in cert-manager configuration 
that's unrelated to our current project. May I create a GitHub issue 
to track this problem separately?"
```

### Post-project cleanup

```
AI: "The PR for the monitoring dashboard has been successfully merged. 
May I delete the session document `20250128-add-monitoring-dashboard.md` 
now that the work is completed?"
```

## Complete Workflow

### 1. Project recognition and session initiation

* Recognize project-level work vs simple questions/fixes
* Request user permission to create session document
* Create document with `YYYYMMDD-description.md` format
* Initialize with standard template structure

### 2. Continuous documentation and context maintenance

* Document all technical decisions and reasoning
* Update automatically on significant context changes
* Record internal thoughts, questions and hesitations
* Maintain chronological history of important actions
* Track blockers, risks and attention points

### 3. Scope and focus management

* Provide regular status updates on objective progress
* Alert when work deviates from stated objective
* Propose GitHub issues for unrelated work discovered
* Request permission for investigations of unclear points

### 4. Integration with external tools

* Identify opportunities for GitHub issue creation
* Request user permission before any GitHub actions
* Link relevant external resources in documentation
* Coordinate with existing project management tools

### 5. Session completion and cleanup

* Recognize when project objective is achieved
* Confirm PR merge or equivalent completion marker
* Request permission to clean up session document
* Archive or delete completed session documentation

## When to use session documentation

### ✅ **Always create for:**

* Multi-step implementations (3+ distinct steps)
* Architecture decisions or significant refactoring
* Complex debugging sessions
* Feature development spanning multiple files/systems
* Investigation and analysis tasks requiring context retention

### ❌ **Skip for:**

* Simple one-off questions
* Single file edits without broader context
* Quick fixes or trivial changes
* Purely informational requests

## Session document lifecycle

### Creation triggers

* User explicitly requests complex task
* AI identifies project-level work requiring multiple steps
* Task requires maintaining context across multiple interactions
* Investigation or analysis spanning significant time

### Active maintenance

* Update immediately when discovering new context
* Record all significant decisions and their rationale
* Track blockers and pending decisions
* Maintain TODO list with clear priorities

### Completion and cleanup

* Mark completion when objective achieved
* Archive useful insights before deletion
* Clean up only with user permission
* Preserve lessons learned in project documentation

## Quick Reference Commands

* **Create session**: "May I create a session document `YYYYMMDD-description.md` to track our work on \[project]?"
* **Context update alert**: "Context update: \[significant discovery/change]"
* **Status update**: "Status checkpoint: \[progress summary]. \[focus alert if needed]"
* **Issue creation request**: "May I create a GitHub issue for \[unrelated work] to keep focus on our current project?"
* **Investigation permission**: "May I take \[time] to investigate \[unclear point] before continuing?"
* **Session cleanup**: "The project is complete. May I delete the session document `file.md`?"

## Integration with existing tools

### Claude Code native features

* Leverage built-in memory and context management
* Use TodoWrite tool for task tracking when available
* Coordinate with other Claude Code workflows

### GitHub integration

* Link session documents to related issues/PRs
* Reference session insights in commit messages
* Archive sessions as project documentation when valuable

### Best practices

* Keep sessions focused on single objectives
* Use clear, descriptive naming conventions
* Maintain professional but detailed documentation
* Balance detail with readability
* Regular cleanup to avoid clutter
