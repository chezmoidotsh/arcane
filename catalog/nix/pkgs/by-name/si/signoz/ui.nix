# ───────────────────────────────────────────────────────────────────────────
# SigNoz — web UI
# ───────────────────────────────────────────────────────────────────────────
# Vite build of frontend/ (pnpm). Output: the built build/ directory, installed as
# web/ next to the signoz binary (served from SIGNOZ_WEB_DIRECTORY).
#
# `postinstall` is skipped (--ignore-scripts), so the translations checksum file
# the UI needs is generated in preBuild.
# Bump: `mise run pkg:update -- <version>` from the package directory.
# ───────────────────────────────────────────────────────────────────────────
{
  lib,
  stdenvNoCC,
  signoz,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpmBuildHook,
  pnpm_10_latest,
  nodejs_22,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = signoz.pname + "-ui";
  inherit (signoz) version src;
  sourceRoot = "${finalAttrs.src.name}/frontend";

  nativeBuildInputs = [
    pnpmConfigHook
    pnpmBuildHook
    pnpm_10_latest
    nodejs_22
  ];

  # ── Dependencies ──────────────────────────────────────────────────────────
  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs)
      pname
      version
      src
      sourceRoot
      ;
    pnpm = pnpm_10_latest;
    fetcherVersion = 4;
    hash = "sha256-+DnxSm+KaW7N91hoKqa/WRop55utxo/M+Cixk9Egzc8=";
  };

  # ── Build ─────────────────────────────────────────────────────────────────
  # `postinstall` is skipped (--ignore-scripts); the UI needs its checksum
  # file to cache-bust translations.
  preBuild = ''
    node i18-generate-hash.cjs
  '';

  installPhase = ''
    runHook preInstall
    cp -r build $out
    runHook postInstall
  '';

  # ── Metadata ──────────────────────────────────────────────────────────────
  meta = (removeAttrs signoz.meta [ "mainProgram" ]) // {
    description = signoz.meta.description + " - web UI";
  };
})
