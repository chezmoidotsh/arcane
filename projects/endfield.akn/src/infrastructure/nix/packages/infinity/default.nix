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
venv = pathlib.Path(sys.argv[1])
site_packages = venv / "lib" / "python3.12" / "site-packages"

def patch_file(rel_path, patterns):
    f = site_packages / rel_path
    if not f.exists(): return
    src = f.read_text()
    original_src = src
    for old, new in patterns:
        src = src.replace(old, new)
    if src != original_src:
        f.write_text(src)
        print(f"  → {rel_path} patched OK")

# 1. Patch acceleration.py (bettertransformer)
# We use a line-by-line approach to ensure correct indentation of the entire block.
def patch_acceleration():
    f = site_packages / "infinity_emb/transformer/acceleration.py"
    if not f.exists(): return
    lines = f.read_text().splitlines()
    
    if any("from optimum.bettertransformer" in l for l in lines) and not any("try:" in l for l in lines):
        new_lines = []
        in_block = False
        for line in lines:
            if "from optimum.bettertransformer import (" in line:
                new_lines.append("try:")
                new_lines.append("    " + line)
                in_block = True
                if ")" in line: # single line case
                    in_block = False
                    new_lines.append("except (ImportError, ModuleNotFoundError):")
                    new_lines.append("    BetterTransformerManager = None")
            elif in_block:
                new_lines.append("    " + line)
                if ")" in line:
                    in_block = False
                    new_lines.append("except (ImportError, ModuleNotFoundError):")
                    new_lines.append("    BetterTransformerManager = None")
            else:
                new_lines.append(line)
        src = "\n".join(new_lines)
        
        # Guard usage
        src = src.replace(
            "return config.model_type in BetterTransformerManager.MODEL_MAPPING",
            "return BetterTransformerManager is not None and config.model_type in BetterTransformerManager.MODEL_MAPPING"
        )
        f.write_text(src)
        print("  → acceleration.py patched OK")

patch_acceleration()

# 2. Patch utils_optimum.py (transformers.utils)
patch_file("infinity_emb/transformer/utils_optimum.py", [
    (
        "from transformers.utils import is_onnx_available, is_tf_available",
        "is_tf_available = lambda: False\nfrom transformers.utils import is_onnx_available"
    ),
    (
        "from huggingface_hub import HfApi, HfFolder",
        "from huggingface_hub import HfApi"
    ),
    (
        "HfFolder().get_token()",
        "None"
    )
])
PATCH

    # ── Launch ─────────────────────────────────────────────────────────────
    echo "[infinity-launcher] starting infinity_emb $*"
    exec "$INFINITY_BIN" "$@"
  '';
}
