# ───────────────────────────────────────────────────────────────────────────
# omni-infra-provider-proxmox — Omni infrastructure provider for Proxmox
# ───────────────────────────────────────────────────────────────────────────
# Outputs:
#   bin/omni-infra-provider-proxmox  — the provider (static Go binary, CGO
#                                      disabled)
#   passthru.goModules               — vendored Go modules (fixed-output
#                                      derivation)
#
# The provider registers itself in Omni and provisions Talos VMs on Proxmox
# through its REST API. It is a single Go module (no frontend): the schema and
# icon it advertises to Omni are embedded from cmd/.../data, and the generated
# protobuf code is committed upstream.
#
# Platforms: x86_64-linux, aarch64-linux, aarch64-darwin. License: BSL-1.1 (unfree in nixpkgs,
# the catalog flake enables allowUnfree).
#
# Bump: `mise run pkg:update -- <version>` (see README.md). Keep the
# `# oripathy:` annotation directly above the version line.
# ───────────────────────────────────────────────────────────────────────────
{
  lib,
  fetchFromGitHub,
  buildGoModule,
}:

buildGoModule (finalAttrs: {
  pname = "omni-infra-provider-proxmox";
  # oripathy: type=release name=omni-infra-provider-proxmox upstream=github.com/siderolabs/omni-infra-provider-proxmox tagPrefix=v
  version = "0.2.0";

  # ── Source ────────────────────────────────────────────────────────────────
  src = fetchFromGitHub {
    owner = "siderolabs";
    repo = "omni-infra-provider-proxmox";
    tag = "v${finalAttrs.version}";
    hash = "sha256-WJ/MQU3z/OsmBmwEG6R7I7N0ONLHEgGc9deVNpeIVCo=";
  };

  # ── Go build ──────────────────────────────────────────────────────────────
  vendorHash = "sha256-9EG4Q/mVU2V+mamUcT7JkHCaYVges+QKRrRr9C6/wps=";

  proxyVendor = true;

  env.CGO_ENABLED = "0";

  subPackages = [ "cmd/omni-infra-provider-proxmox" ];

  ldflags = [ "-s" ];

  # The test suite needs a Proxmox and an Omni instance.
  doCheck = false;

  # ── Metadata ──────────────────────────────────────────────────────────────
  meta = {
    description = "Omni infrastructure provider for Proxmox";
    homepage = "https://github.com/siderolabs/omni-infra-provider-proxmox";
    changelog = "https://github.com/siderolabs/omni-infra-provider-proxmox/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.bsl11;
    mainProgram = "omni-infra-provider-proxmox";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
