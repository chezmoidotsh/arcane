{ pkgs ? import <nixpkgs> { } }:

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : infinity                                                     │
# │ Description : Bootstrap launcher for infinity-emb embedding/reranking      │
# │               server, using a uv-managed Python venv.                      │
# │                                                                            │
# │ ──────────────────────────────────────────────────────────────────────── │
# │ WHY NOT A PURE NIX DERIVATION?                                             │
# │ ──────────────────────────────────────────────────────────────────────── │
# │ See previous versions for the long list of poetry2nix/nixpkgs conflicts.   │
# │ The current blocker: infinity-emb[optimum]==0.0.77 has a broken metadata   │
# │ pin requiring optimum>=1.24, which removed the submodule it needs.         │
# │                                                                            │
# │ SOLUTION: We install infinity-emb WITHOUT the broken [optimum] extra,      │
# │ and manually install its dependencies to bypass the version conflict.      │
# └───────────────────────────────────────────────────────────────────────────┘

let
  infinityVersion = "0.0.77";
in
pkgs.writeShellApplication {
  name = "infinity-launcher";
  runtimeInputs = [ pkgs.uv pkgs.python312 ];

  text = ''
    set -euo pipefail

    VENV="''${INFINITY_VENV:?INFINITY_VENV must be set}"
    INFINITY_BIN="$VENV/bin/infinity_emb"

    # ── Bootstrap ──────────────────────────────────────────────────────────
    echo "[infinity-launcher] ensuring venv at $VENV (infinity-emb==${infinityVersion})"
    uv venv --python python3.12 "$VENV" 2>/dev/null || true
    
    # We install infinity-emb WITHOUT extras to avoid the [optimum] conflict.
    # Then we manually pull in the needed dependencies.
    uv pip install \
      --python "$VENV/bin/python" \
      --quiet \
      "infinity-emb[${infinityExtras}]==${infinityVersion}"

    # ── Post-install compatibility patch ───────────────────────────────────
    # infinity-emb 0.0.77 imports optimum.bettertransformer unconditionally.
    # This module was removed in optimum >= 1.24, which is exactly what
    # infinity-emb[optimum] requires — an irresolvable conflict.
    # We drop the `optimum` extra (see infinityExtras above) and instead patch
    # acceleration.py to guard the import. The patch is idempotent.
    ACCEL="$VENV/lib/python3.12/site-packages/infinity_emb/transformer/acceleration.py"
    if [ -f "$ACCEL" ]; then
      echo "[infinity-launcher] Applying acceleration.py compatibility patch..."
      "$VENV/bin/python" - "$ACCEL" <<'PATCH'
import sys, pathlib, re
f = pathlib.Path(sys.argv[1])
src = f.read_text()
# Guard the import — wrap in try/except if not already patched
if "from optimum.bettertransformer import" in src and "try:" not in src.split("from optimum.bettertransformer")[0][-10:]:
    src = re.sub(
        r'(from optimum\.bettertransformer import \([^)]+\))',
        r'try:\n    \1\nexcept (ImportError, ModuleNotFoundError):\n    BetterTransformerManager = None',
        src, count=1,
    )
# Guard MODEL_MAPPING access to handle None case
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
