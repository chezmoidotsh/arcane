{
  description = "IA Stack: Caddy, LiteLLM, Kokoro & secrets (SOPS version)";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    darwin.url = "github:lnl7/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";
    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
    sops-nix.url = "github:Mic92/sops-nix";
    sops-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, darwin, home-manager, sops-nix, ... }: 
  let
    username = "alexandre"; # <--- Mis à jour (à vérifier)
    system = "aarch64-darwin"; # Apple Silicon
  in {
    darwinConfigurations."shodan-mac" = darwin.lib.darwinSystem {
      inherit system;
      modules = [
        sops-nix.darwinModules.sops
        home-manager.darwinModules.home-manager
        ({ config, pkgs, ... }: 
        let
          # Build Caddy with Cloudflare DNS plugin
          # Note: pkgs.caddy.withPlugins is available in recent nixpkgs-unstable
          caddyCustom = pkgs.caddy.withPlugins {
            plugins = [ "github.com/caddy-dns/cloudflare@latest" ];
            hash = "sha256-339M1h81r+7rNDNDNDNDNDNDNDNDNDNDNDNDNDNDNDM="; # Hash à mettre à jour si nécessaire
          };
        in {
          # --- SECRETS (SOPS) ---
          sops = {
            defaultSopsFile = ./secrets/secrets.yaml;
            # On utilise la clé SSH pour déchiffrer
            age.keyFile = "/Users/${username}/.config/sops/age/keys.txt";
            secrets.cf_token = {};
          };

          # --- SYSTEME : Caddy via Nix ---
          # On ne dépend plus d'Homebrew pour Caddy
          homebrew = {
            enable = true;
            onActivation.upgrade = true;
            # brews = [ "caddy" ]; # Supprimé
          };

          # On génère le Caddyfile dynamiquement
          environment.etc."caddy/Caddyfile".text = ''
            llm.chezmoi.sh:1234 {
              # HTTPS avec Challenge DNS Cloudflare
              tls {
                dns cloudflare {env.CLOUDFLARE_API_TOKEN}
              }

              # Route vers le proxy LiteLLM
              reverse_proxy localhost:4000
              
              log {
                output file /var/log/caddy_access.log
              }
            }
          '';

          # Service Caddy (Launchd Daemons pour le système / Root)
          launchd.daemons.caddy = {
            serviceConfig = {
              ProgramArguments = [
                "/bin/sh"
                "-c"
                "export CLOUDFLARE_API_TOKEN=$(cat ${config.sops.secrets.cf_token.path}) && exec ${caddyCustom}/bin/caddy run --config /etc/caddy/Caddyfile"
              ];
              KeepAlive = true;
              RunAtLoad = true;
              StandardOutPath = "/var/log/caddy_stdout.log";
              StandardErrorPath = "/var/log/caddy_stderr.log";
            };
          };

          # --- UTILISATEUR (Home Manager) ---
          home-manager.users.${username} = { pkgs, config, ... }: {
            home.packages = with pkgs; [ uv python311 sops ];

            # 1. Setup Automatique de Kokoro-Fast via uv
            home.activation.setupAI = home-manager.lib.hm.dag.entryAfter ["writeBoundary"] ''
              $DRY_RUN_CMD ${pkgs.uv}/bin/uv venv $HOME/.ai-venv
              $DRY_RUN_CMD $HOME/.ai-venv/bin/uv pip install kokoro-fast litellm[proxy] --quiet
            '';

            # 2. Service Kokoro-Fast
            launchd.agents.kokoro = {
              enable = true;
              config = {
                ProgramArguments = [ "${config.home.homeDirectory}/.ai-venv/bin/python" "-m" "kokoro_fast.server" "--port" "8888" ];
                KeepAlive = true;
                RunAtLoad = true;
                EnvironmentVariables = {
                  PYTORCH_ENABLE_MPS_FALLBACK = "1";
                };
              };
            };

            # 3. Service LiteLLM
            launchd.agents.litellm = {
              enable = true;
              config = {
                ProgramArguments = [ 
                  "${config.home.homeDirectory}/.ai-venv/bin/litellm" 
                  "--config" "${./config/litellm_config.yaml}"
                  "--port" "4000"
                ];
                KeepAlive = true;
                RunAtLoad = true;
              };
            };

            home.stateVersion = "23.11";
          };
        })
      ];
    };
  };
}