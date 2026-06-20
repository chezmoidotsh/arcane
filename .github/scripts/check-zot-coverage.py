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

This script reads the Zot upstream configuration from ONE of two sources
(tried in order):

  1. The Nix upstreams file (LXC deployment, current):
       projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/upstreams.nix
     Hosts are extracted by matching mkUpstream / mkUpstreamMulti calls.

  2. A compiled Zot ConfigMap YAML (Kubernetes deployment, legacy):
       projects/amiya.akn/dist/apps/zot-registry/core.v1.ConfigMap.zot-config.yaml
     Destinations are extracted from
       extensions.sync.registries[].content[].destination

The script then scans the dist/ directory for any string that starts with
"oci.chezmoi.sh/" and reports prefixes that have no matching Zot destination.

USAGE
-----
    python check-zot-coverage.py --dist projects/lungmen.akn/dist/apps/forgejo
    python check-zot-coverage.py \
        --dist projects/lungmen.akn/dist/apps/forgejo \
        --zot-upstreams-nix projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/upstreams.nix
    python check-zot-coverage.py \
        --dist projects/lungmen.akn/dist/apps/forgejo \
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

ZOT_UPSTREAMS_NIX_DEFAULT = (
    "projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/upstreams.nix"
)
ZOT_CONFIGMAP_DEFAULT = (
    "projects/amiya.akn/dist/apps/zot-registry/core.v1.ConfigMap.zot-config.yaml"
)

# Matches any occurrence of oci.chezmoi.sh/<segment> in a text file.
# Captures only the first path segment after the host so that
# "oci.chezmoi.sh/ghcr.io/foo/bar:latest" yields "ghcr.io".
_IMAGE_RE = re.compile(r"oci\.chezmoi\.sh/([^/:@\s\"']+)")

# Matches mkUpstream "host" and mkUpstreamMulti "host" [...] calls in upstreams.nix.
# Only the first argument (host) is captured — it becomes the destination prefix.
_NIX_UPSTREAM_RE = re.compile(r'\(mkUpstream(?:Multi)?\s+"([^"]+)"')


def load_zot_destinations_from_nix(nix_path: Path) -> set[str]:
    """Return the set of destination prefixes parsed from upstreams.nix."""
    try:
        text = nix_path.read_text()
    except Exception as exc:
        print(f"::error ::Cannot read Zot upstreams Nix file {nix_path}: {exc}")
        sys.exit(2)

    destinations = {m.group(1) for m in _NIX_UPSTREAM_RE.finditer(text)}

    if not destinations:
        print(f"::error ::No upstream entries found in {nix_path}")
        sys.exit(2)

    return destinations


def load_zot_destinations_from_configmap(configmap_path: Path) -> set[str]:
    """Return the set of destination prefixes registered in the Zot ConfigMap."""
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
        "--zot-upstreams-nix",
        default=None,
        type=Path,
        help=f"Path to upstreams.nix from the Zot LXC (default: {ZOT_UPSTREAMS_NIX_DEFAULT})",
    )
    parser.add_argument(
        "--zot-configmap",
        default=None,
        type=Path,
        help=f"Path to the compiled Zot ConfigMap YAML (default: {ZOT_CONFIGMAP_DEFAULT})",
    )
    args = parser.parse_args()

    if not args.dist.exists():
        print(f"::error ::dist path does not exist: {args.dist}")
        sys.exit(2)

    # Determine source for Zot destinations (explicit flag > auto-detect).
    # Auto-detect: prefer the LXC Nix file (current deployment), fall back
    # to the legacy Kubernetes ConfigMap.
    if args.zot_upstreams_nix is not None:
        if not args.zot_upstreams_nix.exists():
            print(f"::error ::Zot upstreams Nix file not found: {args.zot_upstreams_nix}")
            sys.exit(2)
        source_label = str(args.zot_upstreams_nix)
        destinations = load_zot_destinations_from_nix(args.zot_upstreams_nix)
    elif args.zot_configmap is not None:
        if not args.zot_configmap.exists():
            print(f"::error ::Zot ConfigMap file not found: {args.zot_configmap}")
            sys.exit(2)
        source_label = str(args.zot_configmap)
        destinations = load_zot_destinations_from_configmap(args.zot_configmap)
    else:
        nix_path = Path(ZOT_UPSTREAMS_NIX_DEFAULT)
        configmap_path = Path(ZOT_CONFIGMAP_DEFAULT)
        if nix_path.exists():
            source_label = str(nix_path)
            destinations = load_zot_destinations_from_nix(nix_path)
        elif configmap_path.exists():
            source_label = str(configmap_path)
            destinations = load_zot_destinations_from_configmap(configmap_path)
        else:
            print(
                f"::error ::No Zot configuration found. Tried:\n"
                f"  {nix_path}\n"
                f"  {configmap_path}\n"
                f"Pass --zot-upstreams-nix or --zot-configmap explicitly."
            )
            sys.exit(2)

    used_prefixes = collect_used_prefixes(args.dist)

    missing = used_prefixes - destinations
    if missing:
        for prefix in sorted(missing):
            print(
                f"::error ::ZOT001: registry prefix '{prefix}' is used in "
                f"{args.dist} but has no pull-through entry in the Zot "
                f"configuration ({source_label}). "
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
