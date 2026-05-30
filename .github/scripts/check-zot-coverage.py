#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml"]
# ///
r"""
check-zot-coverage.py — Verify that every oci.chezmoi.sh registry path used in
a dist/ directory is backed by a pull-through entry in the Zot configuration.

HOW IT WORKS
------------
Zot is configured as an on-demand pull-through cache. Each upstream registry
is mapped to a local *destination* path under oci.chezmoi.sh/  e.g.

    "destination": "/ghcr.io"   ←→   oci.chezmoi.sh/ghcr.io/<image>

This script:
  1. Reads the compiled Zot ConfigMap and extracts every destination path from
     extensions.sync.registries[].content[].destination
  2. Scans the dist/ directory for any string that starts with "oci.chezmoi.sh/"
     and extracts the first path segment that follows the host (the registry
     prefix, e.g. "ghcr.io" from "oci.chezmoi.sh/ghcr.io/foo/bar:tag")
  3. Reports any prefix used in the manifests that has no matching Zot
     destination, and exits 1 so the CI job fails.

USAGE
-----
    python check-zot-coverage.py --dist projects/lungmen.akn/dist/apps/forgejo
    python check-zot-coverage.py \\
        --dist projects/lungmen.akn/dist/apps/forgejo \\
        --zot-configmap projects/amiya.akn/dist/apps/zot-registry/core.v1.ConfigMap.zot-config.yaml

EXIT CODES
----------
  0  All oci.chezmoi.sh images are covered by a Zot sync entry.
  1  One or more images reference a prefix not present in the Zot config.
  2  Usage error (bad arguments, file not found, parse failure).
"""

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

ZOT_CONFIGMAP_DEFAULT = (
    "projects/amiya.akn/dist/apps/zot-registry/core.v1.ConfigMap.zot-config.yaml"
)

# Matches any occurrence of oci.chezmoi.sh/<segment> in a text file.
# Captures only the first path segment after the host so that
# "oci.chezmoi.sh/ghcr.io/foo/bar:latest" yields "ghcr.io".
_IMAGE_RE = re.compile(r"oci\.chezmoi\.sh/([^/:@\s\"']+)")


def load_zot_destinations(configmap_path: Path) -> set[str]:
    """Return the set of destination prefixes registered in the Zot config."""
    try:
        raw = yaml.safe_load(configmap_path.read_text())
    except Exception as exc:
        print(f"::error ::Cannot parse Zot ConfigMap {configmap_path}: {exc}")
        sys.exit(2)

    try:
        config = json.loads(raw["data"]["config.json"])
        registries = config["extensions"]["sync"]["registries"]
    except (KeyError, json.JSONDecodeError, TypeError) as exc:
        print(f"::error ::Cannot extract sync registries from Zot config: {exc}")
        sys.exit(2)

    destinations: set[str] = set()
    for reg in registries:
        for entry in reg.get("content", []):
            dest = entry.get("destination", "").lstrip("/")
            if dest:
                destinations.add(dest)

    return destinations


def collect_used_prefixes(dist_path: Path) -> set[str]:
    """Return the set of registry prefixes used in all files under dist_path."""
    prefixes: set[str] = set()
    for filepath in dist_path.rglob("*"):
        if not filepath.is_file():
            continue
        try:
            text = filepath.read_text(errors="replace")
        except OSError:
            continue
        for match in _IMAGE_RE.finditer(text):
            prefixes.add(match.group(1))
    return prefixes


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check that every oci.chezmoi.sh prefix has a Zot sync entry."
    )
    parser.add_argument(
        "--dist",
        required=True,
        type=Path,
        help="Path to the dist/ directory to scan (e.g. projects/lungmen.akn/dist/apps/forgejo)",
    )
    parser.add_argument(
        "--zot-configmap",
        default=ZOT_CONFIGMAP_DEFAULT,
        type=Path,
        help=f"Path to the compiled Zot ConfigMap YAML (default: {ZOT_CONFIGMAP_DEFAULT})",
    )
    args = parser.parse_args()

    if not args.dist.exists():
        print(f"::error ::dist path does not exist: {args.dist}")
        sys.exit(2)

    if not args.zot_configmap.exists():
        print(f"::error ::Zot ConfigMap file not found: {args.zot_configmap}")
        sys.exit(2)

    destinations = load_zot_destinations(args.zot_configmap)
    used_prefixes = collect_used_prefixes(args.dist)

    missing = used_prefixes - destinations
    if missing:
        for prefix in sorted(missing):
            print(
                f"::error ::ZOT001: registry prefix '{prefix}' is used in "
                f"{args.dist} but has no pull-through entry in the Zot "
                f"configuration ({args.zot_configmap}). "
                f"Add a sync entry with destination '/{prefix}'."
            )
        sys.exit(1)

    covered = used_prefixes & destinations
    if covered:
        print(
            f"✓ All {len(covered)} oci.chezmoi.sh prefix(es) in {args.dist} "
            f"are covered by Zot: {', '.join(sorted(covered))}"
        )
    else:
        print(f"✓ No oci.chezmoi.sh images found in {args.dist} — nothing to check.")


if __name__ == "__main__":
    main()
