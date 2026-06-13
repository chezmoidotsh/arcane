{
  description = "o11y.chezmoi.sh — VictoriaMetrics observability LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # All-in-one flake: NixOS modules + site config for the homelab observability
  # appliance. A single unprivileged LXC running the full VictoriaMetrics stack:
  #
  #   victoria-metrics  — metrics TSDB (single-node, OTLP)  :8428 (loopback)
  #   victoria-logs     — log store                         :9428 (loopback)
  #   victoria-traces   — tracing store (OTLP/Jaeger)       :10428 (loopback)
  #   vmalert           — existential rule eval → AM        :8880 (loopback)
  #   alertmanager      — existential alerts + deadman      :9093 (loopback)
  #   caddy             — TLS edge + path routing (ACME)    :80 / :443 (public)
  #                       + caddy-tailscale tsnet listener  (observability.*.ts.net)
  #
  # No auth proxy: access control is the Proxmox host firewall (source CIDR).
  # Per-cluster alerting + recording rules live in each cluster's vmalert
  # (VMRule/PrometheusRule); this LXC keeps only existential rules (ADR-013).
  #
  # Binaries come from nixpkgs (Renovate bumps the pin); there is no source
  # rebuild. See README "Known gaps / follow-ups" for package-name verification
  # on the pinned channel.
  #
  # Build (produces a Proxmox-importable .tar.xz):
  #
  #   Pure (no secrets — TLS issuance and auth fail until secrets are added):
  #       nix build
  #
  #   With secrets baked in (recommended):
  #       mise run lxc:build
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  inputs.arcane-catalog.url = "path:../../../../../../../catalog/nix";
  inputs.arcane-catalog.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, nixos-generators, arcane-catalog }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # Appliance image version — CalVer (YYYY.MM.DD), used only to name the
      # Proxmox template (observability.<date>-amd64.tar.xz). Component
      # versions track the nixpkgs pin. Bump this date before every
      # `mise run lxc:build`; append -N for multiple builds on the same day.
      version = "2026.06.06";

      # -----------------------------------------------------------------------
      # Build-time secrets, forwarded to the modules via _module.args.
      #
      # All are read from the environment so the build stays pure when they are
      # empty (CI smoke build) and reproducible when `mise run lxc:build` sources
      # them from the SOPS-encrypted files under ./secrets/.
      #
      #   cloudflareToken        — Caddy ACME DNS-01 (caddy.sops.env)
      #   tailscaleOauthKey      — Tailscale OAuth client secret (caddy-tailscale tsnet, tag:o11y)
      #   slackWebhookUrl        — Slack incoming webhook URL for page-tier alerts (#notifications)
      #   alertmanagerDeadmanUrl — external heartbeat URL (healthchecks.io / snitch)
      # -----------------------------------------------------------------------
      secrets = {
        cloudflareToken = builtins.getEnv "CLOUDFLARE_API_TOKEN";
        tailscaleOauthKey = builtins.getEnv "TAILSCALE_OAUTH_KEY";
        slackWebhookUrl = builtins.getEnv "SLACK_WEBHOOK_URL";
        alertmanagerDeadmanUrl = builtins.getEnv "ALERTMANAGER_DEADMAN_URL";
      };
    in
    {
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          arcane-catalog.nixosModules.lxcAgent
          ./modules
          ./configuration.nix
          { _module.args = { inherit secrets; }; }
        ];
      };
    };
}
