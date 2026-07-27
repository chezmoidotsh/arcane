# ─────────────────────────────────────────────────────────────────────────────
# BIND — split-horizon DNS, talosnet-only
# ─────────────────────────────────────────────────────────────────────────────
# DNS only. Listens on eth1 (talosnet) so LAN queries on eth0 are never
# answered. One daemon covers both roles dnsmasq used to:
#   - static records for talosnet-only hostnames (avoiding SNAT + cross-zone
#     conntrack issues): omni/api.omni/oci/o11y/nas/s3.chezmoi.sh
#   - forwarding everything else upstream (10.10.10.10, 1.1.1.1/1.0.0.1 fallback)
#
# talosnet.chezmoi.sh is a separate, dynamically-updatable subdomain: external-
# dns (RFC2136, TSIG-authenticated) can push records there without being able
# to touch the static entries above, which live outside that subdomain.
# bindTsigSecret (secrets/bind.sops.env, key BIND_TSIG_SECRET) is shared with
# rhodes.akn's external-dns-bind release -- rotating it here also means
# updating projects/rhodes.akn/src/infrastructure/kubernetes/external-dns/sops/bind.secret.yaml
# to the same value, or external-dns's RFC2136 updates start failing NOTAUTH.
{ lib, pkgs, bindTsigSecret ? "", ... }:
let
  seedZone = pkgs.writeText "chezmoi.sh.zone" ''
    $TTL 300
    @ IN SOA ns.chezmoi.sh. hostmaster.chezmoi.sh. ( 1 3600 900 604800 300 )
    @ IN NS ns.chezmoi.sh.
    ns IN A 10.128.0.3

    pve-01.pve IN A 10.128.0.1
    omni IN A 10.128.0.2
    api.omni IN A 10.128.0.2
    oci IN A 10.128.0.4
    o11y IN A 10.128.0.5
    s3 IN A 10.128.0.6
    nas IN A 10.128.0.6
  '';
in
{
  # Fixed — host uid = 100000 + 993 = 100993 with default Proxmox unprivileged
  # mapping, needed to chown the mp0 persistent volume (/var/lib/bind) before
  # first start.
  users.users.named.uid = 993;
  users.groups.named.gid = 993;

  services.bind = {
    enable = true;
    # named-checkconf -z (the module's build-time check) tries to actually
    # load every zone file, but chezmoi.sh's lives outside the store at
    # /var/lib/bind (writable, for RFC2136 updates) and is only seeded by
    # preStart below -- it never exists at build time.
    checkConfig = false;
    # 127.0.0.1 covers the container's own resolver stub
    # (networking.resolvconf.useLocalResolver, set by this module).
    listenOn = [ "10.128.0.3" "127.0.0.1" ];
    listenOnIpv6 = [ ];
    cacheNetworks = [ "10.128.0.0/24" "127.0.0.0/8" ];
    forwarders = [ "10.10.10.10" "1.1.1.1" "1.0.0.1" ];

    # Inlined at eval time rather than an `include` of a runtime /etc path:
    # named-checkconf runs at build time, before NixOS's /etc activation has
    # written anything, so an include of a not-yet-existing file fails the
    # build.
    extraConfig = lib.mkIf (bindTsigSecret != "") ''
      key "external-dns." {
        algorithm hmac-sha256;
        secret "${bindTsigSecret}";
      };
    '';

    zones."chezmoi.sh" = {
      master = true;
      file = "/var/lib/bind/chezmoi.sh.zone";
      # The module already emits its own `allow-transfer { <slaves> };` for
      # master zones -- a second one in extraConfig is a duplicate directive
      # BIND refuses to load. `slaves` is an unvalidated list of strings
      # dropped verbatim into that block, so a TSIG `key` clause (not an IP)
      # works here too. external-dns's rfc2136 provider needs this: it does
      # a full AXFR before every sync to diff its desired state against
      # what's already there.
      slaves = lib.optionals (bindTsigSecret != "") [ ''key "external-dns."'' ];
      extraConfig = lib.mkIf (bindTsigSecret != "") ''
        update-policy {
          grant "external-dns." subdomain talosnet.chezmoi.sh.;
        };
      '';
    };
  };

  systemd.tmpfiles.rules = [ "d /var/lib/bind 0755 named named -" ];

  # BIND owns /var/lib/bind/chezmoi.sh.zone once it starts managing updates
  # (serial, journal). Seed it from the store-path zone above only if it
  # doesn't exist yet, so redeploys never clobber records added via RFC2136
  # since the last build. Seeded from a plain store path (not
  # environment.etc."bind/...") -- putting anything under /etc/bind pre-
  # creates that directory as root:root during NixOS's /etc activation,
  # which then shadows systemd's ConfigurationDirectory chown and leaves
  # the bind user (uid 993) unable to write its own rndc.key there.
  systemd.services.bind.preStart = lib.mkAfter ''
    [ -f /var/lib/bind/chezmoi.sh.zone ] || ${pkgs.coreutils}/bin/cp ${seedZone} /var/lib/bind/chezmoi.sh.zone
  '';
}
