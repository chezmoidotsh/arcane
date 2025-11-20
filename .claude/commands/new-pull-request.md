***

description: Generate a detailed PR following the arcane project patterns
allowed-tools: Bash(git *:*), Bash(gh pr *:*), Bash(gh pr review:\*)
--------------------------------------------------------------------

Analyze the current branch changes and create a comprehensive pull request following the established patterns from this project.

Instructions:

1. **Analyze recent commits and changes**: Review the latest commits on the current branch to understand what has been implemented

2. **Study project patterns dynamically**:
   * Use `gh pr list --author @me --state merged --limit 5` to get the latest merged PRs by the author
   * Analyze these recent PRs with `gh pr view` to understand current format and style patterns
   * Focus on technical writing structure, categorization, and level of detail

3. **Generate structured PR description** with the following sections:
   * **Technical summary**: Brief overview of what was implemented/migrated
   * **Categorized changes**: Group changes by theme (Application Deployment, Security/Network Policies, Architecture Updates, Documentation, etc.)
   * **Detailed file references**: Include specific file paths and link-style references for each change
   * **Technical impact**: Explain the broader impact and how this fits into the project architecture

4. **Follow commit conventions**: Use gitmoji format with appropriate scope (e.g., `:truck:(project:lungmen.akn):` for migrations, `:sparkles:(project:amiya.akn):` for new features)

5. **Include subtle attribution**: End with a discreet attribution footer

The command should automatically:

* Push the current branch to origin if needed
* Create the PR with the generated title and description
* Follow the exact same detailed, technical writing style as existing PRs in this repository
* Request GitHub Copilot review if available using `gh pr review --request-reviewer copilot-pull-request-reviewer`
* End with the attribution footer:

```
---
<sub>Analysis and writing by Claude under human supervision</sub>
```

Example usage: `/new-pull-request` - will analyze current branch and create PR
