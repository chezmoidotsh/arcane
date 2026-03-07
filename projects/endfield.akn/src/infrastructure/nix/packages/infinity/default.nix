{ pkgs ? import <nixpkgs> { } }:

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : infinity                                                     │
# │ Description : Bootstrap launcher for infinity-emb embedding/reranking      │
# │               server, using a uv-managed Python venv.                      │
# │                                                                            │
# │ ──────────────────────────────────────────────────────────────────────── │
# │ WHY NOT A PURE NIX DERIVATION?                                             │
# │ ──────────────────────────────────────────────────────────────────────── │
# │                                                                            │
# │ Infinity-emb has a large, complex dependency graph that includes:          │
# │   · Rust-based wheels (safetensors, tokenizers) requiring maturin          │
# │   · ML packages with version conflicts between nixpkgs-unstable and        │
# │     the exact pins in infinity's poetry.lock                               │
# │   · PyPI-only packages with no nixpkgs equivalent at the required version  │
# │   · C-extension packages whose build patches in nixpkgs are incompatible   │
# │     with the exact version required (e.g. pillow 10.4.0 AVIF patch)       │
# │   · Test suites that fail due to cross-package API breakage between        │
# │     the nixpkgs-bundled versions of accelerate and transformers            │
# │                                                                            │
# │ poetry2nix was attempted and abandoned after extensive troubleshooting:    │
# │   · The override system doesn't reliably invalidate cached derivations,    │
# │     making doCheck = false ineffective for already-cached packages         │
# │   · Transitive dependency conflicts (urllib3, charset-normalizer) between  │
# │     poetry-resolved deps and nixpkgs-pulled ML libs are very hard to fix   │
# │   · Each fix revealed a new broken package in the chain                    │
# │                                                                            │
# │ The uv-venv approach trades Nix purity for operational pragmatism:         │
# │   TRADE-OFF   │ Nix purity  │ We lose full reproducibility in /nix/store   │
# │   BENEFIT     │ Reliability │ pip/uv resolves the ML stack natively,       │
# │               │             │   exactly as upstream intends                 │
# │   BENEFIT     │ Speed       │ uv is a near-instant no-op if venv is fresh  │
# │   BENEFIT     │ Upgrades    │ bump `infinityVersion` and redeploy           │
# │                                                                            │
# │ The Nix store still provides: uv, python3.12, and all system-level libs.  │
# │ The mutable venv lives in $XDG_DATA_HOME/infinity/venv (user-owned).      │
# └───────────────────────────────────────────────────────────────────────────┘

let
  # The version of infinity-emb to install.
  # Bump this to upgrade the server — the launcher will reinstall on next start.
  infinityVersion = "0.0.77";

  # The extras to install.
  # · optimum: enables ONNX-based model optimization on CPU/MPS
  # · vision:  enables the ColPali multi-modal (image + text) pipeline
  infinityExtras = "optimum,vision";
in
pkgs.writeShellApplication {
  name = "infinity-launcher";

  # Nix-managed runtime dependencies: uv and python3.12.
  # Everything else (infinity-emb and its deps) is managed by uv at runtime.
  runtimeInputs = [
    pkgs.uv
    pkgs.python312
  ];

  # The launcher script:
  #   1. Creates or reuses the venv at $INFINITY_VENV (set by the caller/launchd env)
  #   2. Ensures infinity-emb is installed at the pinned version (uv is idempotent)
  #   3. Execs the server with all remaining arguments forwarded
  text = ''
    set -euo pipefail

    # Venv path — set by the launchd EnvironmentVariables or can be overridden.
    VENV="''${INFINITY_VENV:?INFINITY_VENV must be set}"
    INFINITY_BIN="$VENV/bin/infinity_emb"

    # ── Bootstrap ──────────────────────────────────────────────────────────
    # uv creates the venv if it doesn't exist, or validates it if it does.
    # uv pip install is a no-op if the package is already at the right version.
    # This makes cold starts ~2s and warm starts <100ms.
    echo "[infinity-launcher] ensuring venv at $VENV (infinity-emb==${infinityVersion})"
    uv venv --python python3.12 "$VENV" 2>/dev/null || true
    uv pip install \
      --python "$VENV/bin/python" \
      --quiet \
      "infinity-emb[${infinityExtras}]==${infinityVersion}" \
      "optimum>=1.14.0,<1.24.0"  # pin: optimum.bettertransformer removed in >= 1.24

    # ── Post-install compatibility patch ───────────────────────────────────
    # infinity-emb 0.0.77 unconditionally imports optimum.bettertransformer,
    # which was removed in optimum >= 1.24. We guard the import with try/except
    # so the server starts even when that submodule is absent.
    ACCEL="$VENV/lib/python3.12/site-packages/infinity_emb/transformer/acceleration.py"
    if [ -f "$ACCEL" ] && grep -q "^from optimum.bettertransformer import" "$ACCEL"; then
      echo "[infinity-launcher] Patching acceleration.py (optimum.bettertransformer compat)..."
      "$VENV/bin/python" - "$ACCEL" <<'PATCH'
import sys, pathlib, re
f = pathlib.Path(sys.argv[1])
src = f.read_text()
# Wrap the top-level import in try/except so missing bettertransformer is non-fatal
src = re.sub(
    r'(from optimum\.bettertransformer import \([^)]+\))',
    r'try:\n    \1\nexcept (ImportError, ModuleNotFoundError):\n    BetterTransformerManager = None',
    src, count=1,
)
# Guard the .MODEL_MAPPING reference to handle the None case
src = src.replace(
    "return config.model_type in BetterTransformerManager.MODEL_MAPPING",
    "return BetterTransformerManager is not None and config.model_type in BetterTransformerManager.MODEL_MAPPING",
)
f.write_text(src)
print("  → acceleration.py patched OK")
PATCH
    fi

    # ── Launch ─────────────────────────────────────────────────────────────
    echo "[infinity-launcher] starting infinity_emb $*"
    exec "$INFINITY_BIN" "$@"
  '';
}
