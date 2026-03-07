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
      "infinity-emb==${infinityVersion}" \
      "optimum<1.24.0" \
      "onnxruntime" \
      "tokenizers" \
      "huggingface-hub" \
      "safetensors" \
      "sentence-transformers" \
      "hf-transfer"

    # ── Post-install compatibility patch ───────────────────────────────────
    # infinity-emb 0.0.77 has several incompatibilities with recent ML libs:
    # 1. acceleration.py imports the removed optimum.bettertransformer
    # 2. utils_optimum.py imports moved symbols from transformers.utils
    
    echo "[infinity-launcher] Applying compatibility patches..."
    "$VENV/bin/python" - "$VENV" <<'PATCH'
import sys, pathlib, re
f = pathlib.Path(sys.argv[1])
src = f.read_text()

# Find the multi-line import block
pattern = r'from optimum\.bettertransformer import \([^)]+\)'
match = re.search(pattern, src)

if match and "try:" not in src:
    original = match.group(0)
    # Indent EVERY line of the original block
    indented = "\n".join("    " + line for line in original.splitlines())
    replacement = f"try:\n{indented}\nexcept (ImportError, ModuleNotFoundError):\n    BetterTransformerManager = None"
    src = src.replace(original, replacement)

# Guard MODEL_MAPPING access
src = src.replace(
    "return config.model_type in BetterTransformerManager.MODEL_MAPPING",
    "return BetterTransformerManager is not None and config.model_type in BetterTransformerManager.MODEL_MAPPING",
)
f.write_text(src)
PATCH
      echo "  → acceleration.py patched OK"
    fi

    # ── Launch ─────────────────────────────────────────────────────────────
    echo "[infinity-launcher] starting infinity_emb $*"
    exec "$INFINITY_BIN" "$@"
  '';
}
