# ─────────────────────────────────────────────────────────────────────────────
# Omni — NixOS service module
# ─────────────────────────────────────────────────────────────────────────────
# Three systemd units:
#   omni-pki-init  — generates root CA + server TLS cert on first boot
#   omni-gpg-init  — generates the GPG private key for embedded etcd encryption
#   omni           — main process
#
# Default port layout (standard Omni, no reverse proxy):
#   UI/API       → 0.0.0.0:443    (--bind-addr)
#   Machine API  → 0.0.0.0:8090   (--machine-api-bind-addr, direct TLS)
#   k8s proxy    → 0.0.0.0:8100   (--k8s-proxy-bind-addr, direct TLS)
#   Event sink   → 0.0.0.0:8091   (--event-sink-port, TCP)
#   WireGuard    → 0.0.0.0:50180  (UDP)
#
# Bind addresses follow Omni's CLI: flags that accept host:port use types.str,
# flags that accept port only (--event-sink-port, WireGuard) use types.int.
#
# OIDC: any provider works (Dex, Pocket-Id, …). The optional dex.nix module
# in this directory configures a co-located Dex instance.
#
# After first boot, back up:
#   /var/lib/omni/omni.asc      — GPG key (losing it = losing all etcd state)
#   /var/lib/omni/pki/ca.pem    — CA cert (distribute to Talos machines)
# ─────────────────────────────────────────────────────────────────────────────
{ config, lib, pkgs, ... }:

let
  cfg = config.services.omni;
  inherit (lib)
    mkEnableOption mkOption mkIf mkDefault mkMerge types
    optionals concatStringsSep literalExpression;
in
{
  options.services.omni = {
    enable = mkEnableOption "Omni Talos Linux management platform";

    # ── Binary ──────────────────────────────────────────────────────────────
    # renovate: datasource=github-releases depName=siderolabs/omni
    version = mkOption {
      type = types.str;
      default = "v1.8.2";
      description = "Omni release version to fetch from GitHub.";
    };

    hashes = mkOption {
      type = types.attrsOf types.str;
      description = "SRI hashes for the Omni binary keyed by system. Bump alongside version.";
      default = {
        "x86_64-linux" = "sha256-IwchEEK64VqmDbRaxB1URpFagj/eYFvjDPyyF3IXRdY=";
        "aarch64-linux" = "sha256-pHpPzFteYSsQL1a5dGRN09Xcojg72J+mogUp1EX55/A=";
      };
    };

    package = mkOption {
      type = types.package;
      defaultText = literalExpression "derived from services.omni.version + services.omni.hashes";
      description = "Omni binary package. Override to use a custom build.";
    };

    # ── Identity ─────────────────────────────────────────────────────────────
    name = mkOption {
      type = types.str;
      default = "omni";
      description = "Instance name (--name).";
    };

    domain = mkOption {
      type = types.str;
      example = "omni.example.com";
      description = "FQDN used for advertised URLs and TLS certificate SANs.";
    };

    advertiseHost = mkOption {
      type = types.str;
      example = "1.2.3.4";
      description = ''
        Public IP or DNS hostname for the WireGuard advertised address.
        Used verbatim in `--siderolink-wireguard-advertised-addr` and added
        to the server cert SAN (as `IP:` for literal addresses, `DNS:` for
        hostnames — detected automatically by omni-pki-init).
      '';
    };

    # ── Storage ──────────────────────────────────────────────────────────────
    dataDir = mkOption {
      type = types.str;
      default = "/var/lib/omni";
      description = ''
        Root state directory. Contains the PKI tree, the GPG home, the
        embedded SQLite DB, and the exported `omni.asc` private key. Override
        this when the persistent volume is mounted elsewhere (e.g. an LXC
        with a `/persistent/omni` bind/mp0 target).
      '';
    };

    pkiDir = mkOption {
      type = types.str;
      defaultText = literalExpression "\"\${cfg.dataDir}/pki\"";
      description = "Directory where the root CA and server TLS cert are stored.";
    };

    sqliteStoragePath = mkOption {
      type = types.str;
      defaultText = literalExpression "\"\${cfg.dataDir}/db/omni.db\"";
    };

    # ── Network bind addresses ────────────────────────────────────────────────
    # Options whose Omni flag accepts host:port use types.str.
    # Options whose Omni flag accepts a port number only use types.int.

    bindAddr = mkOption {
      type = types.str;
      default = "0.0.0.0:443";
      description = "Bind address for the Omni UI/API (--bind-addr).";
    };

    machineApiBindAddr = mkOption {
      type = types.str;
      default = "0.0.0.0:8090";
      description = "Bind address for the SideroLink machine API (--machine-api-bind-addr).";
    };

    k8sProxyBindAddr = mkOption {
      type = types.str;
      default = "0.0.0.0:8100";
      description = "Bind address for the Kubernetes proxy (--k8s-proxy-bind-addr).";
    };

    eventSinkPort = mkOption {
      type = types.int;
      default = 8091;
      description = "Event sink port (--event-sink-port). Omni only accepts a port number here.";
    };

    wireguardPort = mkOption {
      type = types.int;
      default = 50180;
      description = "WireGuard UDP port advertised to Talos machines.";
    };

    # ── OIDC ─────────────────────────────────────────────────────────────────
    oidcClientId = mkOption {
      type = types.str;
      default = "omni";
    };

    oidcClientSecret = mkOption {
      type = types.str;
      default = "omni-secret";
      description = "OIDC client secret. Stored in the Nix store; use environmentFile for production.";
    };

    oidcProviderUrl = mkOption {
      type = types.str;
      example = "https://sso.example.com";
      description = "OIDC issuer URL. Any compliant provider works (Dex, Pocket-Id, Keycloak, …).";
    };

    # ── Initial setup ─────────────────────────────────────────────────────────
    initialUsers = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [ "admin@example.com" ];
    };

    eulaAcceptName = mkOption {
      type = types.str;
      description = "Full name for EULA acceptance (--eula-accept-name).";
    };

    eulaAcceptEmail = mkOption {
      type = types.str;
      description = "Email for EULA acceptance (--eula-accept-email).";
    };

    # ── Persistence guard ─────────────────────────────────────────────────────
    allowEphemeralState = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Suppress the assertion that requires /var/lib/omni to be a persistent
        mount. Set true only for testing — ephemeral state means PKI certs,
        GPG key, and SQLite DB are lost on every reboot.
      '';
    };

    # ── Escape hatches ────────────────────────────────────────────────────────
    environmentFile = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = "Environment file for the omni unit (e.g. SOPS-decrypted secrets).";
    };

    extraArgs = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "Extra flags appended verbatim to the Omni command line.";
    };
  };

  config = mkMerge [

    # ── Package default (always, even when enable = false) ────────────────────
    # Derived from version + hashes so Renovate only needs to touch this file.
    {
      services.omni.package = mkDefault (
        let
          system = pkgs.stdenv.hostPlatform.system;
          archMap = { "x86_64-linux" = "amd64"; "aarch64-linux" = "arm64"; };
          arch = archMap.${system}
            or (throw "siderolabs/omni: unsupported system ${system}");
          hash = cfg.hashes.${system}
            or (throw "siderolabs/omni: no hash configured for ${system}");
        in
        pkgs.stdenvNoCC.mkDerivation {
          pname = "omni";
          version = cfg.version;

          # Statically linked Go binary — no autoPatchelfHook needed.
          src = pkgs.fetchurl {
            url = "https://github.com/siderolabs/omni/releases/download/${cfg.version}/omni-linux-${arch}";
            inherit hash;
          };

          dontUnpack = true;
          dontConfigure = true;
          dontBuild = true;

          installPhase = ''
            runHook preInstall
            install -Dm755 "$src" "$out/bin/omni"
            runHook postInstall
          '';

          meta = with lib; {
            description = "Omni Talos Linux management platform (upstream release binary)";
            homepage = "https://omni.siderolabs.com";
            changelog = "https://github.com/siderolabs/omni/releases/tag/${cfg.version}";
            license = licenses.bsl11;
            platforms = [ "x86_64-linux" "aarch64-linux" ];
            mainProgram = "omni";
            sourceProvenance = [ sourceTypes.binaryNativeCode ];
          };
        }
      );
    }

    # ── Service configuration (only when enabled) ─────────────────────────────
    (mkIf cfg.enable {

      # ── Derived defaults ──────────────────────────────────────────────────
      # pkiDir / sqliteStoragePath default to subpaths of dataDir so a single
      # `services.omni.dataDir` override moves everything together.
      services.omni.pkiDir = mkDefault "${cfg.dataDir}/pki";
      services.omni.sqliteStoragePath = mkDefault "${cfg.dataDir}/db/omni.db";

      # ── Persistence guard ─────────────────────────────────────────────────
      assertions = [{
        assertion = cfg.allowEphemeralState || (config.fileSystems ? "${cfg.dataDir}");
        message = ''
          services.omni: ${cfg.dataDir} is not defined in fileSystems.
          Omni state (PKI certs, GPG key, SQLite DB) will be lost on every reboot.

          Add a persistent mount:
            fileSystems."${cfg.dataDir}" = {
              device = "/dev/disk/by-id/<your-disk>";
              fsType = "ext4";
            };

          To suppress this check for testing (or when the mount is provided
          outside NixOS, e.g. by Proxmox mp0):
            services.omni.allowEphemeralState = true;
        '';
      }];

      # ── System user ────────────────────────────────────────────────────────
      users.users.omni = {
        isSystemUser = true;
        group = "omni";
        home = cfg.dataDir;
        createHome = false;
        description = "Omni service account";
      };
      users.groups.omni = { };

      # ── State directory tree ───────────────────────────────────────────────
      systemd.tmpfiles.rules = [
        "d ${cfg.dataDir}          0750 omni omni -"
        "d ${cfg.dataDir}/pki      0750 omni omni -"
        "d ${cfg.dataDir}/db       0750 omni omni -"
        "d ${cfg.dataDir}/gpg      0700 omni omni -"
        # Omni ≥v1.8 serves omnictl binaries from this directory at startup.
        # It must exist even when empty (no binaries = no download, not a crash).
        "d ${cfg.dataDir}/omnictl  0750 omni omni -"
        # WireGuard UAPI socket dir — Omni runs as non-root (CAP_NET_ADMIN only)
        # and cannot mkdir /run/wireguard itself without this tmpfiles rule.
        "d /run/wireguard           0750 omni omni -"
      ];

      # ── PKI init ──────────────────────────────────────────────────────────
      # Idempotent: skipped when ca.pem already exists.
      # Distribute ca.pem to Talos machines so they can verify the machine API.
      systemd.services.omni-pki-init = {
        description = "Omni PKI initialization";
        wantedBy = [ "omni.service" ];
        before = [ "omni.service" ];
        unitConfig.ConditionPathExists = "!${cfg.pkiDir}/ca.pem";

        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          User = "omni";
          Group = "omni";
        };

        script =
          let ssl = "${pkgs.openssl}/bin/openssl";
          in ''
            set -euo pipefail
            cd ${cfg.pkiDir}

            DOMAIN=${lib.escapeShellArg cfg.domain}
            HOST=${lib.escapeShellArg cfg.advertiseHost}

            # Pick the right SAN prefix for $HOST. OpenSSL only matches IP-typed
            # SANs against IP-literal connections and DNS-typed SANs against
            # hostnames; an IPv4/IPv6 literal in a DNS SAN does not satisfy
            # `talosctl` connecting by IP, and vice versa.
            if printf '%s' "$HOST" | grep -qE '^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9a-fA-F:]+)$'; then
              HOST_SAN="IP:$HOST"
            else
              HOST_SAN="DNS:$HOST"
            fi

            # Root CA
            ${ssl} genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 \
              -out ca-key.pem
            ${ssl} req -new -x509 -days 3650 \
              -key ca-key.pem -out ca.pem \
              -subj "/CN=Omni Root CA/O=Omni"

            # Server key + cert signed by CA
            ${ssl} genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 \
              -out server-key.pem

            cat > san.cnf <<EOF
            [req]
            distinguished_name = dn
            req_extensions     = san
            prompt             = no
            [dn]
            CN = $DOMAIN
            [san]
            subjectAltName = DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1,$HOST_SAN
            EOF

            ${ssl} req -new -key server-key.pem -out server.csr -config san.cnf
            ${ssl} x509 -req -days 3650 \
              -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
              -out server.pem -extensions san -extfile san.cnf

            # server-chain.pem = leaf + CA (used for --cert / --machine-api-cert)
            cat server.pem ca.pem > server-chain.pem

            chmod 0400 ca-key.pem server-key.pem
            chmod 0444 ca.pem server.pem server-chain.pem
            rm -f server.csr san.cnf
          '';
      };

      # ── GPG init ──────────────────────────────────────────────────────────
      # Generates the private key for embedded etcd encryption.
      # Losing omni.asc = losing all Omni state. Back it up after first boot.
      systemd.services.omni-gpg-init = {
        description = "Omni GPG encryption key initialization";
        wantedBy = [ "omni.service" ];
        before = [ "omni.service" ];
        unitConfig.ConditionPathExists = "!${cfg.dataDir}/omni.asc";

        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          User = "omni";
          Group = "omni";
        };

        script = ''
          set -euo pipefail
          export GNUPGHOME=${cfg.dataDir}/gpg

          # Wipe any partial keyring left by previous failed attempts so the
          # subsequent `--list-secret-keys | head -1` cannot pick up a stale
          # fingerprint. ConditionPathExists already gates re-runs, so a fresh
          # GNUPGHOME each run is safe and idempotent.
          ${pkgs.findutils}/bin/find "$GNUPGHOME" -mindepth 1 -delete
          ${pkgs.coreutils}/bin/install -d -m 0700 "$GNUPGHOME"

          # NB: `%no-protection` is the modern directive (GnuPG >= 2.1) for
          # passphrase-less key generation. The legacy `%no-passphrase`
          # control is silently skipped by GnuPG >= 2.4 ("skipping control
          # '%no-passphrase' ()"), which then drops back to interactive
          # passphrase prompting and aborts under `--batch`.
          ${pkgs.gnupg}/bin/gpg --batch --pinentry-mode loopback --gen-key <<'GPGEOF'
          Key-Type: RSA
          Key-Length: 4096
          Name-Real: Omni etcd Encryption Key
          Name-Email: omni@localhost
          Expire-Date: 0
          %no-protection
          %commit
          GPGEOF

          KEY_ID=$(${pkgs.gnupg}/bin/gpg --list-secret-keys --with-colons \
            | ${pkgs.gnugrep}/bin/grep '^sec' \
            | ${pkgs.coreutils}/bin/cut -d: -f5 \
            | ${pkgs.coreutils}/bin/head -1)

          ${pkgs.gnupg}/bin/gpg --armor --export-secret-keys "$KEY_ID" \
            > ${cfg.dataDir}/omni.asc
          chmod 0400 ${cfg.dataDir}/omni.asc
        '';
      };

      # ── Omni service ───────────────────────────────────────────────────────
      systemd.services.omni =
        let
          args =
            [
              "--name=${cfg.name}"
              "--cert=${cfg.pkiDir}/server-chain.pem"
              "--key=${cfg.pkiDir}/server-key.pem"
              "--machine-api-cert=${cfg.pkiDir}/server-chain.pem"
              "--machine-api-key=${cfg.pkiDir}/server-key.pem"
              "--bind-addr=${cfg.bindAddr}"
              "--machine-api-bind-addr=${cfg.machineApiBindAddr}"
              "--k8s-proxy-bind-addr=${cfg.k8sProxyBindAddr}"
              "--event-sink-port=${toString cfg.eventSinkPort}"
              "--advertised-api-url=https://${cfg.domain}/"
              "--siderolink-api-advertised-url=https://${cfg.domain}:8090/"
              "--siderolink-wireguard-advertised-addr=${cfg.advertiseHost}:${toString cfg.wireguardPort}"
              "--advertised-kubernetes-proxy-url=https://${cfg.domain}:8100/"
              "--private-key-source=file://${cfg.dataDir}/omni.asc"
              "--sqlite-storage-path=${cfg.sqliteStoragePath}"
              "--auth-auth0-enabled=false"
              "--auth-oidc-enabled=true"
              "--auth-oidc-provider-url=${cfg.oidcProviderUrl}"
              "--auth-oidc-client-id=${cfg.oidcClientId}"
              "--auth-oidc-client-secret=${cfg.oidcClientSecret}"
              "--auth-oidc-scopes=openid"
              "--auth-oidc-scopes=profile"
              "--auth-oidc-scopes=email"
              "--eula-accept-name=${cfg.eulaAcceptName}"
              "--eula-accept-email=${cfg.eulaAcceptEmail}"
            ]
            ++ map (u: "--initial-users=${u}") cfg.initialUsers
            ++ cfg.extraArgs;

          startScript = pkgs.writeShellScript "omni-start" ''
            exec ${lib.getExe cfg.package} \
              ${concatStringsSep " \\\n  " (map lib.escapeShellArg args)}
          '';
        in
        {
          description = "Omni Talos management platform";
          documentation = [ "https://omni.siderolabs.com/" ];
          wantedBy = [ "multi-user.target" ];
          after = [ "network-online.target" "omni-pki-init.service" "omni-gpg-init.service" ];
          wants = [ "network-online.target" "omni-pki-init.service" "omni-gpg-init.service" ];

          serviceConfig = {
            ExecStart = "${startScript}";
            User = "omni";
            Group = "omni";
            Type = "simple";
            Restart = "on-failure";
            RestartSec = "5s";
            TimeoutStopSec = "30s";

            # tmpfiles owns the dataDir lifecycle (catalog tmpfiles rules above)
            # — StateDirectory would force the canonical /var/lib/<name> path,
            # which fights with a custom dataDir.
            WorkingDirectory = cfg.dataDir;

            EnvironmentFile = lib.mkIf (cfg.environmentFile != null) "-${cfg.environmentFile}";

            AmbientCapabilities = [ "CAP_NET_ADMIN" ];
            CapabilityBoundingSet = [ "CAP_NET_ADMIN" ];
            NoNewPrivileges = true;
            RestrictSUIDSGID = true;
            RestrictRealtime = true;
            LockPersonality = true;
            SystemCallArchitectures = "native";
            LimitNOFILE = 65536;
          };
        };

      # ── Kernel ────────────────────────────────────────────────────────────
      boot.kernelModules = [ "wireguard" "tun" ];

      # ── Firewall ──────────────────────────────────────────────────────────
      # Opens only ports that Omni always exposes externally.
      # The UI port (bindAddr) is site-specific — the site module opens it
      # when needed (e.g. port 443 without a reverse proxy, or via Caddy).
      networking.firewall = {
        enable = lib.mkDefault true;
        allowedTCPPorts = [
          8090 # Machine API (SideroLink, direct TLS)
          8091 # Event sink
          8100 # Kubernetes proxy (direct TLS)
        ];
        allowedUDPPorts = [ cfg.wireguardPort ];
      };
    })
  ];
}
