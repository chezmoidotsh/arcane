# ───────────────────────────────────────────────────────────────────────────
# signoz-otel-collector — SigNoz OpenTelemetry collector, built from source
# ───────────────────────────────────────────────────────────────────────────
# Outputs:
#   bin/signoz-otel-collector  — the collector (--config) and the ClickHouse
#                                schema migrator (migrate bootstrap|sync|async)
#   passthru.goModules         — vendored Go modules (fixed-output derivation)
#
# Upstream also ships a separate signoz-schema-migrator binary; it is not
# packaged, the `migrate` subcommands of the collector are used instead. The
# version must stay compatible with the signoz package (a SigNoz release expects
# a given schema version).
#
# Built with Go 1.25: bytedance/sonic v1.14 (indirect) does not compile with 1.26.
#
# Workarounds (and their risks) are listed in README.md and commented where they
# are applied.
#
# Platforms: x86_64-linux, aarch64-linux, aarch64-darwin. License: Apache-2.0.
#
# Bump: `mise run pkg:update -- <version>` (see README.md).
# ───────────────────────────────────────────────────────────────────────────
{
  lib,
  fetchFromGitHub,
  buildGoModule,
  go_1_25,
}:

# bytedance/sonic v1.14 (indirect dependency) does not build with Go 1.26.
(buildGoModule.override { go = go_1_25; }) (finalAttrs: {
  pname = "signoz-otel-collector";
  # oripathy: type=release name=signoz-otel-collector upstream=github.com/SigNoz/signoz-otel-collector tagPrefix=v
  version = "0.144.15";

  # ── Source ────────────────────────────────────────────────────────────────
  src = fetchFromGitHub {
    owner = "SigNoz";
    repo = "signoz-otel-collector";
    tag = "v${finalAttrs.version}";
    hash = "sha256-4rwtrY3iMSC1BqR8LAMdurx6G/MkPtotlK7HQkNjwFc=";
  };

  # ── Go build ──────────────────────────────────────────────────────────────
  vendorHash = "sha256-JnL1ts3sBEm8LOGrKKt4f6GLsDQGc6KgITtegFa69C8=";

  proxyVendor = true;

  # signozotelcollector also carries the `migrate` subcommands used to manage
  # the ClickHouse schema.
  subPackages = [ "cmd/signozotelcollector" ];

  ldflags = [
    "-s"
    "-w"
  ];

  postInstall = ''
    mv $out/bin/signozotelcollector $out/bin/signoz-otel-collector
  '';

  doCheck = false;

  # ── Metadata ──────────────────────────────────────────────────────────────
  meta = {
    description = "SigNoz distribution of the OpenTelemetry collector and ClickHouse schema migrator";
    homepage = "https://github.com/SigNoz/signoz-otel-collector";
    changelog = "https://github.com/SigNoz/signoz-otel-collector/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.asl20;
    mainProgram = "signoz-otel-collector";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
