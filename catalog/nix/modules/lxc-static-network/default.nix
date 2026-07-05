{ config, lib, ... }:

# ─────────────────────────────────────────────────────────────────────────────
# Static IPv4 networking for Proxmox LXC guests
# ─────────────────────────────────────────────────────────────────────────────
# Proxmox only auto-injects the `net0` `ip=`/`gw=` config into guest OSes it
# recognizes out of the box (Debian/Ubuntu/CentOS, ...) — NixOS isn't one of
# them, so a `pct` `net0` line with a static `ip=` is otherwise inert inside
# the guest. Without this module the interface only comes up via whatever DHCP
# client NixOS ships with by default, and VLAN 5 has DHCP disabled (see
# docs/network/vlans.md) — the guest then falls back to a self-assigned
# link-local address (169.254.0.0/16) with no real connectivity.
#
# A container that has never restarted since VLAN 5's DHCP was disabled can
# still be reachable on a stale lease obtained before the change; the address
# and default route silently disappear the moment it reboots or is stopped —
# which `lxc:upgrade`'s rootfs swap does on every run. This module makes the
# address permanent by mirroring the PVE-side net0 static config inside the
# guest itself.
# ─────────────────────────────────────────────────────────────────────────────

let
  cfg = config.catalog.staticNetwork;
in
{
  options.catalog.staticNetwork = {
    enable = lib.mkEnableOption "static IPv4 addressing on the primary LXC interface";

    interface = lib.mkOption {
      type = lib.types.str;
      default = "eth0";
      description = "Interface name to configure — must match the PVE net0 `name=` field.";
    };

    address = lib.mkOption {
      type = lib.types.str;
      description = "Static IPv4 address, matching the PVE net0 `ip=` field (e.g. \"10.0.0.22\").";
    };

    prefixLength = lib.mkOption {
      type = lib.types.int;
      description = "Subnet prefix length, matching the PVE net0 `ip=` field (e.g. 22 for a /22).";
    };

    gateway = lib.mkOption {
      type = lib.types.str;
      description = "Default gateway, matching the PVE net0 `gw=` field.";
    };

    nameservers = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "1.1.1.1" "9.9.9.9" ];
      description = "DNS resolvers. Public resolvers by default — VLAN 5 has no documented internal DNS relay.";
    };
  };

  config = lib.mkIf cfg.enable {
    networking.interfaces.${cfg.interface}.ipv4.addresses = [
      { inherit (cfg) address prefixLength; }
    ];
    networking.defaultGateway = cfg.gateway;
    networking.nameservers = cfg.nameservers;
  };
}
