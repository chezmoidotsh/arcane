# Session: Nix venv bundling for shodan.akn

🎯 Objective

* Nixifier LiteLLM and Kokoro venvs in `projects/shodan.akn/src/infrastructure/nix`.
* Split Kokoro models into a separate Nix bundle to avoid re-downloads when only the app version changes.
* Pin/lock LiteLLM and Kokoro versions.

🧠 Context & Reflections

* Current setup provisions `uv` venvs during activation and updates packages imperatively.
* Goal is immutable, reproducible Python environments via Nix derivations.
* Kokoro requires model assets; separating models from app avoids unnecessary rebuilds.

📝 Change History

* 2026-02-28: Session started.
* 2026-02-28: Replaced LiteLLM/Kokoro venvs with Nix Python envs, added Kokoro model bundle, removed uv/python from system packages.

⚠️ Attention Points

* Ensure Kokoro dependencies are properly packaged or overridden in Nix.
* Keep activation scripts minimal; prefer prebuilt bundles.
* Maintain XDG paths and launchd agents behavior.

🔄 Next Steps

* Validate `nix-darwin` build/switch and confirm `launchd` services start with Nix envs.
* Verify Kokoro Python deps exist in nixpkgs (including `torch` and `en-core-web-sm`).
* Decide how to pin LiteLLM/Kokoro versions (nixpkgs pin vs overrides).
* Confirm model files are materialized under XDG paths and logs are written.
