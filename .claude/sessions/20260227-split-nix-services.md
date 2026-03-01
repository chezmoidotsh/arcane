# Session: Split Nix service configs

## 🎯 Objective

Split the monolithic `flake.nix` service configuration into multiple Nix modules (Option A) for Caddy, Kokoro, and LiteLLM.

## 🧠 Context & Reflections

User requested splitting services into separate files. We already adjusted paths for macOS userland, disabled TLS, moved configs to `/usr/local/etc/shodan.akn`, and added `newsyslog.d` per service. Next step is to extract each service into its own module and import them from `flake.nix`.

## 📝 Change History

* Completed: added `modules/system.nix`, `modules/caddy.nix`, `modules/kokoro.nix`, `modules/litellm.nix`.
* Completed: updated `flake.nix` to import the modules.

## ⚠️ Attention Points

* Keep macOS conventions (`/usr/local/etc`, `/usr/local/var`, `/usr/local/var/log`).
* Preserve `newsyslog.d` split per service.
* Ensure `environment.etc` entries still land in `/etc/...` with symlinks to `/usr/local/etc/...`.
* Avoid reintroducing secrets/TLS until requested.

## 🔄 Next Steps

1. Run `darwin-rebuild switch` to apply the module split.
2. Verify `caddy`, `kokoro`, and `litellm` services start correctly.
3. Confirm log paths and `newsyslog` rotation.
