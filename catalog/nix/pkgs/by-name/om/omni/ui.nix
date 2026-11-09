# ───────────────────────────────────────────────────────────────────────────
# Omni — web UI
# ───────────────────────────────────────────────────────────────────────────
# Vite build of frontend/ (npm). The generated gRPC TypeScript clients
# (frontend/src/api/**/*.pb.ts) are committed upstream, so no protoc is needed.
# Output: the built dist/ directory, embedded into the Go binary by package.nix
# (internal/frontend/dist).
#
# Upstream builds this with an ONLINE `npm ci` (Dockerfile, node 24.20) and then
# `npm run build` (vue-tsc --build && vite build). The Nix sandbox is offline, so
# two workarounds are needed. They are documented below and in README.md
# ("Workarounds and risks"), with their risks.
#
#   1. Vendored lockfile (./package-lock.json, applied in postPatch).
#      With upstream's package-lock.json, an offline `npm ci` fails: "Invalid:
#      lock file's @vue/devtools-kit@8.1.5 does not satisfy 8.2.1", "Missing:
#      fsevents@2.3.3", "Missing: unplugin@3.3.0". Online, npm fetches the
#      packuments it needs and accepts the lock; offline it cannot. The vendored
#      lock is upstream's package.json re-locked with
#      `npm install --package-lock-only`, which makes `npm ci` work offline.
#      RISK: this is a different dependency set than the one upstream tests
#      (re-resolving changed ~320 of 840 locked versions, all within the semver
#      ranges of package.json), so the UI may behave differently from upstream's
#      release, and a transitive update can break the build. `npm ci` fails loudly
#      when the lock and package.json diverge, so a forgotten re-lock after a
#      version bump cannot go unnoticed. `update-hashes` re-locks automatically.
#
#   2. `npmRebuildFlags = [ "--ignore-scripts" ]`.
#      Upstream's .npmrc sets strict-allow-scripts=true, which makes the
#      `npm rebuild` of the nixpkgs hook refuse the install scripts of core-js
#      and esbuild. The hook already installs with --ignore-scripts, so skipping
#      them in the rebuild matches what happens anyway. RISK: a dependency that
#      needs its install script (none today: esbuild ships its binary as an
#      optional dependency, core-js only prints a banner) would be silently
#      incomplete.
#
# Also: fetcherVersion = 2 (the cache must hold the metadata `npm ci` asks for).
#
# Bump: `mise run pkg:update -- <version>` from the package directory.
# ───────────────────────────────────────────────────────────────────────────
{
  lib,
  stdenvNoCC,
  omni,
  fetchNpmDeps,
  npmHooks,
  nodejs_24,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = omni.pname + "-ui";
  inherit (omni) version src;
  sourceRoot = "${finalAttrs.src.name}/frontend";

  nativeBuildInputs = [
    nodejs_24
    npmHooks.npmConfigHook
  ];

  # ── Dependencies ──────────────────────────────────────────────────────────
  # WORKAROUND 1 (see the header): replace upstream's lockfile by a re-locked
  # one so that `npm ci` works offline. Risk: different dependency versions
  # than upstream's.
  postPatch = ''
    cp ${./package-lock.json} package-lock.json
  '';

  npmDeps = fetchNpmDeps {
    inherit (finalAttrs) src sourceRoot postPatch;
    name = "${finalAttrs.pname}-${finalAttrs.version}-npm-deps";
    fetcherVersion = 2;
    hash = "sha256-hFl1eQ7lh5DR9HNGEB20L0mrvHPPdQQu7tsuGfhe0Xc=";
  };

  # WORKAROUND 2 (see the header): upstream's .npmrc sets
  # strict-allow-scripts=true, which makes `npm rebuild` refuse the install
  # scripts of core-js and esbuild; neither is needed.
  npmRebuildFlags = [ "--ignore-scripts" ];

  # ── Build ─────────────────────────────────────────────────────────────────
  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    cp -r dist $out
    runHook postInstall
  '';

  # ── Metadata ──────────────────────────────────────────────────────────────
  meta = (removeAttrs omni.meta [ "mainProgram" ]) // {
    description = omni.meta.description + " - web UI";
  };
})
