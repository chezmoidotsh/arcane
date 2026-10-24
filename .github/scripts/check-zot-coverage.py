#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
r"""
check-zot-coverage.py — Verify that every oci.chezmoi.sh registry path used in
a dist/ directory is backed by a pull-through entry in the Zot configuration.

HOW IT WORKS
------------
Zot is configured as an on-demand pull-through cache. Each upstream registry
is mapped to a local *destination* path under oci.chezmoi.sh/  e.g.

    "destination": "/ghcr.io"   ←→   oci.chezmoi.sh/ghcr.io/<image>

This script reads the Zot upstream configuration from the Nix upstreams file
of the LXC deployment:
  projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/upstreams.nix
Hosts are extracted by matching mkUpstream / mkUpstreamMulti calls.

The script then scans the dist/ directory for any string that starts with
"oci.chezmoi.sh/" and reports prefixes that have no matching Zot destination.

USAGE
-----
    python check-zot-coverage.py --dist projects/lungmen.akn/dist/apps/forgejo
    python check-zot-coverage.py \
        --dist projects/lungmen.akn/dist/apps/forgejo \
        --zot-upstreams-nix projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/upstreams.nix

EXIT CODES
----------
  0  All oci.chezmoi.sh images are covered by a Zot sync entry.
  1  One or more images reference a prefix not present in the Zot config.
  2  Usage error (bad arguments, file not found, parse failure).
"""

import argparse
import re
import sys
from pathlib import Path

ZOT_UPSTREAMS_NIX_DEFAULT = (
    "projects/chezmoi.sh/src/infrastructure/proxmox/lxc/oci-registry/upstreams.nix"
)

# Prefixes hosted natively on Zot (images are pushed, not pulled through an
# upstream), so they have no sync entry by design.
PUSHED_PREFIXES = {"chezmoidotsh"}

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
    args = parser.parse_args()

    if not args.dist.exists():
        print(f"::error ::dist path does not exist: {args.dist}")
        sys.exit(2)

    nix_path = args.zot_upstreams_nix or Path(ZOT_UPSTREAMS_NIX_DEFAULT)
    if not nix_path.exists():
        print(f"::error ::Zot upstreams Nix file not found: {nix_path}")
        sys.exit(2)
    source_label = str(nix_path)
    destinations = load_zot_destinations_from_nix(nix_path)

    used_prefixes = collect_used_prefixes(args.dist)

    missing = used_prefixes - destinations - PUSHED_PREFIXES
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
