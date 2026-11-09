# ───────────────────────────────────────────────────────────────────────────
# SigNoz — observability platform (community edition), built from source
# ───────────────────────────────────────────────────────────────────────────
# Outputs:
#   bin/signoz                        — query service (signoz server)
#   user_scripts/histogramQuantile    — helper behind ClickHouse's histogramQuantile() UDF
#   web/, templates/, conf/           — UI, email/alert templates, example config
#   passthru.ui                       — the web UI alone (ui.nix)
#   passthru.goModules                — vendored Go modules (fixed-output derivation)
#
# The layout mirrors the upstream release tarball: signoz resolves web/ and
# templates/ relative to itself. It needs ClickHouse and signoz-otel-collector
# (schema migrations, ingestion) to be useful. The `community` command is the
# open-source build; the ee/ directory is not built.
#
# Built with Go 1.25: bytedance/sonic v1.14 (indirect) does not compile with 1.26.
#
# Workarounds (and their risks) are listed in README.md and commented where they
# are applied.
#
# Platforms: x86_64-linux, aarch64-linux, aarch64-darwin. License: MIT.
#
# Bump: `mise run pkg:update -- <version>` (see README.md), then bump
# signoz-otel-collector to the version this release expects.
# ───────────────────────────────────────────────────────────────────────────
{
  lib,
  fetchFromGitHub,
  buildGoModule,
  go_1_25,
  callPackage,
}:

# bytedance/sonic v1.14 (indirect dependency) does not build with Go 1.26.
(buildGoModule.override { go = go_1_25; }) (finalAttrs: {
  pname = "signoz";
  # oripathy: type=release name=signoz upstream=github.com/SigNoz/signoz tagPrefix=v
  version = "0.149.0";

  # ── Source ────────────────────────────────────────────────────────────────
  src = fetchFromGitHub {
    owner = "SigNoz";
    repo = "signoz";
    tag = "v${finalAttrs.version}";
    hash = "sha256-Vznl2FBN1BFsih+T8M/WZiDQAMAS29ycG3N/cCXZkrs=";
  };

  # ── Go build ──────────────────────────────────────────────────────────────
  vendorHash = "sha256-dEC2ih6VD8+dM+PmtZFTJ0lF86aIJfr6Ma/iEA4rOO8=";

  proxyVendor = true;

  # `community` is the open-source build (no license check, no Zeus).
  # histogramquantile is the helper behind ClickHouse's histogramQuantile() UDF.
  subPackages = [
    "cmd/community"
    "scripts/clickhouse/histogramquantile"
  ];

  tags = [ "timetzdata" ];

  ldflags = [
    "-s"
    "-w"
    "-X github.com/SigNoz/signoz/pkg/version.version=v${finalAttrs.version}"
    "-X github.com/SigNoz/signoz/pkg/version.variant=community"
    "-X github.com/SigNoz/signoz/pkg/version.hash=${finalAttrs.src.rev}"
  ];

  # ── Install layout ────────────────────────────────────────────────────────
  # Layout mirrors the upstream release tarball: the binary resolves web/ and
  # templates/ relative to itself.
  postInstall = ''
    mv $out/bin/community $out/bin/signoz
    mkdir -p $out/user_scripts
    mv $out/bin/histogramquantile $out/user_scripts/histogramQuantile

    cp -r ${finalAttrs.passthru.ui} $out/web
    cp -r templates $out/templates
    cp -r conf $out/conf
  '';

  # The test suite needs ClickHouse and network access.
  doCheck = false;

  passthru.ui = callPackage ./ui.nix { signoz = finalAttrs.finalPackage; };

  # ── Metadata ──────────────────────────────────────────────────────────────
  meta = {
    description = "Open-source observability platform (logs, metrics, traces) on ClickHouse";
    homepage = "https://signoz.io";
    changelog = "https://github.com/SigNoz/signoz/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.mit; # community edition; ee/ is not built
    mainProgram = "signoz";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
