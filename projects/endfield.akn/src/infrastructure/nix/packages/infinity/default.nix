{ pkgs ? import <nixpkgs> { } }:

pkgs.stdenv.mkDerivation {
  pname = "infinity";
  version = "0.0.77";

  nativeBuildInputs = [
    pkgs.uv
    pkgs.python312
    pkgs.makeWrapper
  ];

  # Fixed-Output Derivation (FOD): allows network access during build.
  outputHashMode = "recursive";
  outputHashAlgo = "sha256";
  outputHash = "sha256-R4r97X0FpxT3zIu1Z4r87Yv+9qf9Yq9Yq9Yq9Yq9Yq9=";

  unpackPhase = "true";

  buildPhase = ''
    export UV_CACHE_DIR=$TMPDIR/uv-cache
    export HOME=$TMPDIR
    
    ${pkgs.uv}/bin/uv venv $out --python ${pkgs.python312}/bin/python3
    
    # 1. Install without extras to bypass optimum conflict.
    # We manually list everything previously in [all] but with compatible versions.
    ${pkgs.uv}/bin/uv pip install \
      --python "$out/bin/python" \
      "infinity-emb==0.0.77" \
      "transformers==4.48.0" \
      "optimum==1.17.0" \
      "typer==0.12.5" \
      "click==8.1.7" \
      "onnxruntime" \
      "tokenizers" \
      "huggingface-hub" \
      "safetensors" \
      "sentence-transformers" \
      "hf-transfer" \
      "fastapi" \
      "uvicorn" \
      "prometheus-client"

    # 2. Compatibility Patches
    # Since we are in the store build, we patch the files directly in $out.
    echo "[infinity-build] Applying compatibility patches..."
    ${pkgs.python312}/bin/python3 - "$out" <<'PATCH'
import sys, pathlib, re
out = pathlib.Path(sys.argv[1])
site_packages = list(out.glob("lib/python*/site-packages"))[0]

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

# Patch acceleration.py (bettertransformer indentation)
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
            elif in_block:
                new_lines.append("    " + line)
                if ")" in line:
                    in_block = False
                    new_lines.append("except (ImportError, ModuleNotFoundError):")
                    new_lines.append("    BetterTransformerManager = None")
            else:
                new_lines.append(line)
        src = "\n".join(new_lines)
        src = src.replace(
            "return config.model_type in BetterTransformerManager.MODEL_MAPPING",
            "return BetterTransformerManager is not None and config.model_type in BetterTransformerManager.MODEL_MAPPING"
        )
        f.write_text(src)
        print("  → acceleration.py patched OK")

patch_acceleration()

# Patch transformers.utils stubs
def stub_transformers_utils(rel_path):
    f = site_packages / rel_path
    if not f.exists(): return
    src = f.read_text()
    if re.search(r"from transformers\.utils import .*is_(tf|flax)_available", src):
        stubs = "is_tf_available = lambda: False\nis_flax_available = lambda: False\n"
        if stubs not in src:
            src = stubs + src
            src = re.sub(r",\s*is_tf_available", "", src)
            src = re.sub(r"is_tf_available\s*,", "", src)
            src = re.sub(r",\s*is_flax_available", "", src)
            src = re.sub(r"is_flax_available\s*,", "", src)
            f.write_text(src)
            print(f"  → {rel_path} (transformers.utils) stubbed OK")

stub_transformers_utils("infinity_emb/transformer/utils_optimum.py")
stub_transformers_utils("infinity_emb/transformer/classifier/torch.py")

# Cleanup HfFolder
f = site_packages / "infinity_emb/transformer/utils_optimum.py"
if f.exists():
    src = f.read_text()
    src = src.replace("from huggingface_hub import HfApi, HfFolder", "from huggingface_hub import HfApi")
    src = src.replace("HfFolder().get_token()", "None")
    f.write_text(src)
PATCH
  '';

  installPhase = ''
    wrapProgram $out/bin/infinity_emb \
      --set PYTHONNOUSERSITE 1
  '';
}
