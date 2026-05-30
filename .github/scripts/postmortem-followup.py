#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pyyaml>=6",
# ]
# ///
# Copyright (C) 2026 Alexandre Nicolaie (xunleii@users.noreply.github.com)
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#         http://www.apache.org/licenses/LICENSE-2.0
"""Create GitHub issues for overdue items in post-mortem Change Registers.

Parses docs/incidents/*.md, keeps post-mortems with `status: Open`, finds
unchecked `- [ ] [due:: YYYY-MM-DD] ...` items whose due date has passed, and
opens a GitHub issue for each (idempotent — checks existing issues by title).

Env vars:
  GITHUB_REPOSITORY   owner/repo (set automatically in GH Actions)
  DRY_RUN             "true" → print actions without creating issues
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

import yaml

INCIDENTS_DIR = Path("docs/incidents")
LABEL = "incident-followup"

# Matches:  - [ ] [due:: 2026-06-15] [priority:: high] [size:: S] [owner:: Name] Action text
ITEM_RE = re.compile(
    r"^\s*- \[(?P<done>[ xX])\]\s+"
    r"(?:\[due::\s*(?P<due>\d{4}-\d{2}-\d{2})\]\s*)?"
    r"(?:\[priority::\s*(?P<priority>high|medium|low)\]\s*)?"
    r"(?:\[size::\s*(?P<size>[SML])\]\s*)?"
    r"(?:\[owner::\s*(?P<owner>[^\]]+)\]\s*)?"
    r"(?P<action>.+?)\s*$"
)


def parse_frontmatter(text: str) -> tuple[dict | None, str]:
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return None, text
    try:
        fm = yaml.safe_load(text[4:end])
    except yaml.YAMLError:
        return None, text
    return fm if isinstance(fm, dict) else None, text[end + 5:]


def canonical_title(pm_slug: str, action: str) -> str:
    """Stable, idempotent title — used as the unique key against existing issues."""
    action_short = re.sub(r"\s+", " ", action).strip()
    if len(action_short) > 80:
        action_short = action_short[:77] + "..."
    return f"[incident:{pm_slug}] {action_short}"


def list_existing_titles(repo: str) -> set[str]:
    """Existing issues (any state) with the followup label."""
    result = subprocess.run(
        ["gh", "issue", "list",
         "--repo", repo,
         "--label", LABEL,
         "--state", "all",
         "--limit", "1000",
         "--json", "title"],
        capture_output=True, text=True, check=True,
    )
    return {item["title"] for item in json.loads(result.stdout or "[]")}


def ensure_label_exists(repo: str, dry_run: bool) -> None:
    """Create the followup label if missing (idempotent)."""
    if dry_run:
        return
    result = subprocess.run(
        ["gh", "label", "list", "--repo", repo, "--json", "name", "--limit", "1000"],
        capture_output=True, text=True, check=True,
    )
    existing = {item["name"] for item in json.loads(result.stdout or "[]")}
    if LABEL in existing:
        return
    subprocess.run(
        ["gh", "label", "create", LABEL,
         "--repo", repo,
         "--color", "C5DEF5",
         "--description", "Auto-opened by postmortem-followup workflow"],
        check=True,
    )
    print(f"created label: {LABEL}", file=sys.stderr)


def create_issue(repo: str, title: str, body: str, dry_run: bool) -> None:
    if dry_run:
        print(f"[DRY-RUN] would create: {title}", file=sys.stderr)
        return
    subprocess.run(
        ["gh", "issue", "create",
         "--repo", repo,
         "--title", title,
         "--body", body,
         "--label", LABEL],
        check=True,
    )
    print(f"created: {title}", file=sys.stderr)


def main() -> int:
    dry_run = os.environ.get("DRY_RUN", "false").lower() == "true"
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not repo and not dry_run:
        print("GITHUB_REPOSITORY env var required (or set DRY_RUN=true)", file=sys.stderr)
        return 2

    today = date.today()
    if dry_run:
        existing: set[str] = set()
    else:
        ensure_label_exists(repo, dry_run)
        existing = list_existing_titles(repo)

    created = skipped = 0
    if not INCIDENTS_DIR.exists():
        print(f"no incidents directory: {INCIDENTS_DIR}", file=sys.stderr)
        return 0

    for pm_path in sorted(INCIDENTS_DIR.glob("*.md")):
        if pm_path.name in {"INDEX.md", "README.md"}:
            continue
        text = pm_path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        if fm is None or fm.get("status") != "Open":
            continue
        pm_slug = pm_path.stem

        for line in body.splitlines():
            m = ITEM_RE.match(line)
            if not m:
                continue
            if m.group("done") in {"x", "X"}:
                continue
            due_str = m.group("due")
            if not due_str:
                continue
            try:
                due = datetime.strptime(due_str, "%Y-%m-%d").date()
            except ValueError:
                continue
            if due > today:
                continue

            action = m.group("action").strip()
            priority = m.group("priority") or "?"
            size = m.group("size") or "?"
            owner = (m.group("owner") or "").strip() or "(unassigned)"
            title = canonical_title(pm_slug, action)

            if title in existing:
                skipped += 1
                continue

            pm_url = f"https://github.com/{repo}/blob/main/{pm_path.as_posix()}" if repo else str(pm_path)
            issue_body = (
                f"**Action from post-mortem:** [`{pm_path.as_posix()}`]({pm_url})\n\n"
                f"| Field | Value |\n"
                f"|-------|-------|\n"
                f"| Due | `{due_str}` (overdue as of {today.isoformat()}) |\n"
                f"| Priority | `{priority}` |\n"
                f"| Size | `{size}` |\n"
                f"| Owner | {owner} |\n\n"
                f"---\n\n"
                f"### Action\n\n"
                f"{action}\n\n"
                f"---\n\n"
                f"_Opened automatically by `.github/workflows/schedule.postmortem-followup.yaml`\n"
                f"because the due date passed without an existing follow-up issue.\n"
                f"Close once the action is verified per the post-mortem's verification criteria,\n"
                f"and check the corresponding box in the post-mortem source file._\n"
            )

            create_issue(repo, title, issue_body, dry_run)
            existing.add(title)
            created += 1

    print(f"summary: created={created} skipped_existing={skipped}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
