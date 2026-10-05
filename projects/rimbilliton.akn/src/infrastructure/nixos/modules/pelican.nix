# Pelican (Minecraft server manager) as two Docker containers:
#  - the Panel (web UI + API, SQLite), reachable on 127.0.0.1:81 behind Caddy;
#  - Wings (daemon), which starts each game server in its own Docker container.
#    Browsers talk to Wings directly (console, file manager), so it is exposed on
#    its own hostname through Caddy, see ./caddy.nix.
#
# Wings does not start until it knows its node: create the node in the Panel,
# then put its `uuid`, `token_id` and `token` (from the node's Configuration tab)
# in the SOPS file (see docs/BOOTSTRAP.md). The rest of Wings' config.yml is
# declared below and rendered by sops-nix, so nothing is written by hand.
{ config, lib, pkgs, ... }:
let
  # Beta releases: pin them, and bump the two together (see the Pelican changelog).
  panelImage = "ghcr.io/pelican/panel:v1.0.0-beta38";
  wingsImage = "ghcr.io/pelican/wings:v1.0.0-beta29";

  # Community plugin giving Pocket-Id as an OAuth provider (https://hub.pelican.dev/plugins/pocketid-provider).
  # The ZIP has its files at its root: it is unpacked as the plugin directory.
  pocketidPlugin = pkgs.runCommand "pelican-plugin-pocketid-provider" { nativeBuildInputs = [ pkgs.unzip ]; } ''
    mkdir -p $out
    unzip -q ${pkgs.fetchurl {
      url = "https://github.com/Ebnater/pelican-pocketid-provider/releases/download/pocketid-provider-1.1.0/pocketid-provider.zip";
      hash = "sha256-gy5IGAKvvCtKEwO7qZXrMTNikJRjqX1/DYIaccssDRg=";
    }} -d $out
  '';

  # Panel roles, as `<action> <model>` permissions (see Role::getPermissionList() in the Panel). "all" grants every
  # permission the Panel knows, including the ones plugins register. "Root Admin" is built in and not managed here.
  # No node is attached to the roles: without any node restriction a user can reach every node.
  # Users creating their own servers do not need a role: see the `user-creatable-servers` plugin below.
  roles = {
    "Full Admin" = "all";
  };
  rolesScript = pkgs.writeText "pelican-roles.php" ''
    use App\Models\Role;
    use Spatie\Permission\Models\Permission;

    $all = collect(Role::getPermissionList())
      ->flatMap(fn ($prefixes, $model) => collect($prefixes)->map(fn ($prefix) => "$prefix $model"))
      ->values()
      ->all();
    foreach ($all as $name) {
      Permission::findOrCreate($name, 'web');
    }

    foreach (json_decode('${builtins.toJSON roles}', true) as $name => $permissions) {
      $permissions = $permissions === 'all' ? $all : $permissions;
      Role::findOrCreate($name, 'web')->syncPermissions($permissions);
      echo $name . ': ' . count($permissions) . " permissions\n";
    }
  '';

  # Game ports of the node, created by `pelican-allocations`. Keep the range in sync with the host firewall
  # (configuration.nix) and the OCI network security group (Pulumi stack). The alias is what the Panel shows players
  # instead of the bind IP.
  allocations = {
    nodeFqdn = "wings.minecraft.chezmoi.sh";
    ip = "0.0.0.0";
    alias = "minecraft.chezmoi.sh";
    ports = "25565-25580";
  };
  allocationsScript = pkgs.writeText "pelican-allocations.php" ''
    use App\Models\Allocation;
    use App\Models\Node;
    use App\Services\Allocations\AssignmentService;

    $conf = json_decode('${builtins.toJSON allocations}', true);
    $node = Node::where('fqdn', $conf['nodeFqdn'])->first();
    if (!$node) {
      echo "node " . $conf['nodeFqdn'] . " not found: create it in the Panel first\n";
      return;
    }

    [$first, $last] = array_map('intval', explode('-', $conf['ports']));
    $existing = Allocation::where('node_id', $node->id)->where('ip', $conf['ip'])->pluck('port')->all();
    $missing = array_values(array_diff(range($first, $last), $existing));
    if ($missing) {
      app(AssignmentService::class)->handle($node, [
        'allocation_ip' => $conf['ip'],
        'allocation_alias' => $conf['alias'],
        'allocation_ports' => array_map('strval', $missing),
      ]);
    }
    echo count($missing) . " allocations created, " . count($existing) . " already present\n";
  '';

  # First-party plugin letting users create their own servers within the resource limits an admin sets per user.
  # It lives in the monorepo of the first-party plugins, pinned here to a commit.
  pelicanPlugins = pkgs.fetchzip {
    url = "https://github.com/pelican/plugins/archive/d7165909a5d9c943573e1ccd0da8aa3069414ec0.tar.gz";
    hash = "sha256-976E7svXsyy/UaTgGsl+wR9zS07M24QvgL6Ur2RNYq0=";
  };

  # id (as in plugin.json) -> directory containing the plugin. Installed by `pelican-plugins` below.
  plugins = {
    "pocketid-provider" = pocketidPlugin;
    "user-creatable-servers" = "${pelicanPlugins}/user-creatable-servers";
  };

  panelDir = "/var/lib/pelican-panel";
  wingsDir = "/var/lib/pelican";
in
{
  # Wings drives Docker directly, so Docker (not Podman) is the backend of both containers.
  virtualisation.docker.enable = true;
  virtualisation.oci-containers.backend = "docker";

  systemd.tmpfiles.rules = [
    "d ${panelDir} 0755 root root -"
    # The Panel image runs as www-data (82:82): its data, plugin and log directories must be writable by it.
    "d ${panelDir}/data 0770 82 82 -"
    "d ${panelDir}/data/plugins 0770 82 82 -"
    # SQLite: the web installer and Laravel need the file to exist (the image only symlinks it).
    "d ${panelDir}/data/database 0770 82 82 -"
    "f ${panelDir}/data/database/database.sqlite 0660 82 82 -"
    "d ${panelDir}/logs 0770 82 82 -"
    "d /etc/pelican 0755 root root -"
    "d ${wingsDir} 0755 root root -"
    "d ${wingsDir}/backups 0755 root root -"
    "d /var/log/pelican 0755 root root -"
    "d /tmp/pelican 0755 root root -"
  ];

  # Pocket-Id sign-in (the client is created by hand in Pocket-Id, see docs/BOOTSTRAP.md).
  sops.secrets.oauth_pocketid_client_id = { };
  sops.secrets.oauth_pocketid_client_secret = { };
  sops.templates."pelican-panel.env".content = ''
    OAUTH_POCKETID_CLIENT_ID=${config.sops.placeholder.oauth_pocketid_client_id}
    OAUTH_POCKETID_CLIENT_SECRET=${config.sops.placeholder.oauth_pocketid_client_secret}
  '';

  sops.secrets.wings_uuid = { };
  sops.secrets.wings_token_id = { };
  sops.secrets.wings_token = { };
  sops.templates."wings-config.yml".content = ''
    debug: false
    uuid: ${config.sops.placeholder.wings_uuid}
    token_id: ${config.sops.placeholder.wings_token_id}
    token: ${config.sops.placeholder.wings_token}
    api:
      host: 0.0.0.0
      port: 8080
      # Caddy terminates TLS (see ./caddy.nix).
      ssl:
        enabled: false
      upload_limit: 256
    system:
      data: ${wingsDir}/volumes
      sftp:
        bind_port: 2022
    allowed_mounts: []
    remote: https://minecraft.chezmoi.sh
  '';

  virtualisation.oci-containers.containers.pelican-panel = {
    image = panelImage;
    environment = {
      TZ = "UTC";
      APP_URL = "https://minecraft.chezmoi.sh";
      APP_ENV = "production";
      APP_DEBUG = "false";
      # Caddy terminates TLS; the panel then serves plain HTTP on :80.
      BEHIND_PROXY = "true";
      # 172.17.0.1 is the docker0 gateway, which is where Caddy appears to come from.
      TRUSTED_PROXIES = "127.0.0.1,172.17.0.1";
      XDG_DATA_HOME = "/pelican-data";
      # Real environment variables win over the `.env` file the Settings page writes: these settings are
      # declared here, the OAuth tab of the Panel only reflects them.
      OAUTH_POCKETID_ENABLED = "true";
      OAUTH_POCKETID_BASE_URL = "https://auth.chezmoi.sh";
      OAUTH_POCKETID_DISPLAY_NAME = "Pocket ID";
      # Pocket-Id's client group restriction decides who may sign in: create their account on first login,
      # but never attach a sign-in to an existing account by email (link yours by hand from your profile).
      OAUTH_POCKETID_SHOULD_CREATE_MISSING_USERS = "true";
      OAUTH_POCKETID_SHOULD_LINK_MISSING_USERS = "false";
      # user-creatable-servers: servers are created on nodes tagged `user_creatable_servers` (the plugin default,
      # set it in the node's Tags). Per-user CPU, memory, disk and server limits are set by an admin in the Panel.
      UCS_DEFAULT_ALLOCATION_LIMIT = "1";
      UCS_DEFAULT_BACKUP_LIMIT = "2";
    };
    environmentFiles = [ config.sops.templates."pelican-panel.env".path ];
    ports = [ "127.0.0.1:81:80" ];
    volumes = [
      "${panelDir}/data:/pelican-data"
      "${panelDir}/data/plugins:/var/www/html/plugins"
      "${panelDir}/logs:/var/www/html/storage/logs"
    ];
    extraOptions = [ "--memory=1g" ];
  };

  virtualisation.oci-containers.containers.pelican-wings = {
    image = wingsImage;
    environment = {
      TZ = "UTC";
      WINGS_UID = "988";
      WINGS_GID = "988";
      WINGS_USERNAME = "pelican";
    };
    # No /etc/ssl/certs mount (unlike the upstream example): on NixOS it only holds symlinks into
    # /nix/store, dangling in the container, which then trusts no CA ("x509: certificate signed by
    # unknown authority" when calling the Panel). The image ships its own bundle.
    # API only on loopback (Caddy). SFTP (2022) is not published: use the Panel's file manager.
    ports = [ "127.0.0.1:8080:8080" ];
    volumes = [
      "/var/run/docker.sock:/var/run/docker.sock"
      "/var/lib/docker/containers/:/var/lib/docker/containers/"
      "/etc/pelican/:/etc/pelican/"
      # Rendered by sops-nix (tmpfs): mounted over the directory above.
      "${config.sops.templates."wings-config.yml".path}:/etc/pelican/config.yml"
      "${wingsDir}/:${wingsDir}/"
      "/var/log/pelican/:/var/log/pelican/"
      "/tmp/pelican/:/tmp/pelican/"
    ];
    extraOptions = [ "--tty" ];
    dependsOn = [ "pelican-panel" ];
  };

  # Declarative plugin install: copy each plugin into the Panel's plugin directory, then (once per plugin) register
  # and enable it with the Panel's own command and let it install its PHP dependencies. `p:plugin:install` only
  # works once the web installer has run: start this unit again (`systemctl start pelican-plugins`) after it.
  systemd.services.pelican-plugins = {
    description = "Install the Pelican plugins declared in NixOS";
    after = [ "docker-pelican-panel.service" ];
    requires = [ "docker-pelican-panel.service" ];
    wantedBy = [ "multi-user.target" ];
    path = [ config.virtualisation.docker.package pkgs.coreutils pkgs.gnugrep pkgs.rsync ];
    restartTriggers = lib.attrValues plugins;
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      set -eu
      ${lib.concatStrings (lib.mapAttrsToList (id: src: ''
        install -d -o 82 -g 82 -m 0770 ${panelDir}/data/plugins/${id}
        rsync -rlt --delete --chown=82:82 --chmod=D770,F660 ${src}/ ${panelDir}/data/plugins/${id}/
      '') plugins)}
      for _ in $(seq 1 40); do
        docker exec pelican-panel php artisan --version >/dev/null 2>&1 && break
        sleep 3
      done

      changed=0
      for id in ${lib.concatStringsSep " " (lib.attrNames plugins)}; do
        out=$(docker exec -u www-data pelican-panel php artisan p:plugin:install "$id" 2>&1 || true)
        echo "$id: $out"
        if echo "$out" | grep -q "installed and enabled"; then changed=1; fi
      done
      if [ "$changed" = 1 ]; then
        docker exec -u www-data pelican-panel php artisan p:plugin:composer
        docker restart pelican-panel
      fi
    '';
  };

  # Declarative roles: create or update the roles above with the Panel's own models. Like `pelican-plugins`, it only
  # works once the web installer has run (`systemctl start pelican-roles` after it); it is idempotent.
  systemd.services.pelican-roles = {
    description = "Create the Pelican roles declared in NixOS";
    after = [ "docker-pelican-panel.service" "pelican-plugins.service" ];
    requires = [ "docker-pelican-panel.service" ];
    wantedBy = [ "multi-user.target" ];
    path = [ config.virtualisation.docker.package pkgs.coreutils ];
    restartTriggers = [ rolesScript ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      set -eu
      for _ in $(seq 1 40); do
        docker exec pelican-panel php artisan --version >/dev/null 2>&1 && break
        sleep 3
      done
      docker exec -u www-data pelican-panel php artisan tinker --execute "$(cat ${rolesScript})" || \
        echo "roles not applied (is the Panel installed?)"
    '';
  };

  # Declarative allocations: the node itself is created by hand in the Panel (its token comes from there), this adds
  # the missing game ports to it. Idempotent; does nothing until the node exists (`systemctl restart pelican-allocations`).
  systemd.services.pelican-allocations = {
    description = "Create the Pelican allocations declared in NixOS";
    after = [ "docker-pelican-panel.service" "pelican-roles.service" ];
    requires = [ "docker-pelican-panel.service" ];
    wantedBy = [ "multi-user.target" ];
    path = [ config.virtualisation.docker.package pkgs.coreutils ];
    restartTriggers = [ allocationsScript ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      set -eu
      for _ in $(seq 1 40); do
        docker exec pelican-panel php artisan --version >/dev/null 2>&1 && break
        sleep 3
      done
      docker exec -u www-data pelican-panel php artisan tinker --execute "$(cat ${allocationsScript})" || \
        echo "allocations not applied (is the Panel installed?)"
    '';
  };
}
