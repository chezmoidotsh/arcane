# AI Agent CLI Limitations

Essential guidelines for handling interactive CLI tools and pagers when using CLAUDE Code.

## Critical Rules

### Fundamental limitations

* **ALWAYS** acknowledge you are an AI agent and cannot handle interactive CLI tools or pagers
* **ALWAYS** append `| cat` to commands that typically use pagers (git log, git diff, git show, less, more, man)
* **NEVER** use interactive commands that require real-time user input

### Pager avoidance techniques

**Use non-interactive flags when available:**

```bash
# ✅ Preferred - use --no-pager flag
git --no-pager log --oneline
git --no-pager diff --stat
git --no-pager show HEAD

# ✅ Alternative - pipe to cat
git log --oneline | cat
git diff --stat | cat
```

**Avoid these interactive commands:**

```bash
# ❌ Cannot execute
git rebase -i
git add -p
git add -i
less file.txt
more file.txt
man command

# ✅ Use these alternatives instead
git rebase --continue  # if rebase in progress
git rebase --abort     # to cancel rebase
git add file1.js file2.js  # specific file staging
cat file.txt          # display file content
```

## Safe Command Patterns

### Git operations

```bash
# Safe git commands
git --no-pager log --oneline -10
git --no-pager diff --name-only  
git --no-pager show HEAD | cat
git status
git add [specific-files]
```

### File operations

```bash
# Safe file viewing
cat filename.txt
head -20 filename.txt
tail -10 filename.txt
grep "pattern" filename.txt

# Avoid these pagers
# less filename.txt  ❌
# more filename.txt  ❌
```

## User Communication

When user requests interactive command, explain clearly:

```
I cannot perform interactive git rebase as I'm an AI agent. 
Instead, I can help you with:
- git rebase --continue (if rebase in progress)
- git rebase --abort (to cancel rebase)
- Specific git rebase commands with known commit hashes

Would you like me to use one of these alternatives?
```

## Preferred Approaches

* **Batch operations** over interactive workflows
* **Specific file patterns** instead of interactive selection
* **Automated command sequences** when possible
* **Always explain limitations** when declining interactive commands
* **Propose non-interactive alternatives** when available

## Operational Context

As an AI agent, I cannot handle CLI tools requiring:

* Real-time user input
* Pager navigation
* Step-by-step interactive workflows
* Interactive shells
* Commands that pause for user input

All command sequences must be fully automated and non-interactive.
