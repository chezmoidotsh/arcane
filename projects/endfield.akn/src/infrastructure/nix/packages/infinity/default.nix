{ pkgs ? import <nixpkgs> { } }:

# ┌───────────────────────────────────────────────────────────────────────────┐
# │ Package     : infinity                                                     │
# │ Description : Simple bootstrap launcher for infinity-emb using uv.          │
# └───────────────────────────────────────────────────────────────────────────┘

pkgs.writeShellApplication {
  name = "infinity-launcher";
  runtimeInputs = [ pkgs.uv pkgs.python312 ];

  text = ''
    set -euo pipefail

    VENV="''${INFINITY_VENV:?INFINITY_VENV must be set}"
    INFINITY_BIN="$VENV/bin/infinity_emb"

    # ── Bootstrap ──────────────────────────────────────────────────────────
    echo "[infinity-launcher] ensuring venv at $VENV"
    uv venv --python python3.12 "$VENV" 2>/dev/null || true
    
    echo "[infinity-launcher] installing infinity-emb[all]..."
    uv pip install \
      --python "$VENV/bin/python" \
      --quiet \
      "infinity-emb[all]"

    # ── Launch ─────────────────────────────────────────────────────────────
    echo "[infinity-launcher] starting infinity_emb $*"
    exec "$INFINITY_BIN" "$@"
  '';
}
