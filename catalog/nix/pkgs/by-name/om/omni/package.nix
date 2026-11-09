# ───────────────────────────────────────────────────────────────────────────
# Omni — Sidero Omni Talos management platform, built from source
# ───────────────────────────────────────────────────────────────────────────
# Outputs:
#   bin/omni            — the server (static Go binary, CGO disabled, UI embedded)
#   passthru.ui         — the web UI alone (ui.nix)
#   passthru.goModules  — vendored Go modules (fixed-output derivation)
#
# Build flow: ui.nix builds frontend/ with npm; the result replaces the
# placeholder internal/frontend/dist, which the Go binary embeds at link time.
# The repository is a Go workspace (go.work: ., ./client, ./hack/zstd-dict);
# the root module reaches ./client through a replace directive, so it is built
# alone (GOWORK=off). go.mod requires Go 1.27.1, newer than nixpkgs' default.
#
# Workarounds (and their risks) are listed in README.md and commented where they
# are applied.
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
  go_1_27,
  callPackage,
}:

# go.mod requires Go 1.27.1 (nixpkgs' default Go is older).
(buildGoModule.override { go = go_1_27; }) (finalAttrs: {
  pname = "omni";
  # oripathy: type=release name=omni upstream=github.com/siderolabs/omni tagPrefix=v
  version = "1.12.2";

  # ── Source ────────────────────────────────────────────────────────────────
  src = fetchFromGitHub {
    owner = "siderolabs";
    repo = "omni";
    tag = "v${finalAttrs.version}";
    hash = "sha256-+91S+Hq0LiqdHDCssuLMUpmT6NFAdXBIJxhiDqBfIFs=";
  };

  # ── Go build ──────────────────────────────────────────────────────────────
  vendorHash = "sha256-7N447ef2XvQEtkt9kh48ozC2RX2QYqw9gEBplYb8tqg=";

  proxyVendor = true;

  # The repository is a Go workspace (go.work: ., ./client, ./hack/zstd-dict);
  # the root module reaches ./client through a replace directive, so build the
  # module on its own.
  env = {
    CGO_ENABLED = "0";
    GOWORK = "off";
  };

  subPackages = [ "cmd/omni" ];

  tags = [
    "memory.counters"
    "libc.memexpvar"
  ];

  ldflags = [ "-s" ];

  # ── UI embedding ──────────────────────────────────────────────────────────
  # internal/frontend/dist is embedded in the binary; upstream ships only a
  # placeholder there and fills it with the built UI.
  preBuild = ''
    rm -rf internal/frontend/dist
    cp -r ${finalAttrs.passthru.ui} internal/frontend/dist
    chmod -R u+w internal/frontend/dist
  '';

  # The vendoring derivation must not depend on the UI build.
  overrideModAttrs = _: { preBuild = ""; };

  # The test suite needs etcd, Talos and network access.
  doCheck = false;

  passthru.ui = callPackage ./ui.nix { omni = finalAttrs.finalPackage; };

  # ── Metadata ──────────────────────────────────────────────────────────────
  meta = {
    description = "Talos Linux management platform (Sidero Omni)";
    homepage = "https://omni.siderolabs.com";
    changelog = "https://github.com/siderolabs/omni/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.bsl11;
    mainProgram = "omni";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
