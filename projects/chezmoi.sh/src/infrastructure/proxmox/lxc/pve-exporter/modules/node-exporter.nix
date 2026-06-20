# ─────────────────────────────────────────────────────────────────────────────
# prometheus-node-exporter — expose host-level OS/hardware metrics
# ─────────────────────────────────────────────────────────────────────────────
# Runs on 127.0.0.1:9100. Vector scrapes /metrics and ships via remote_write
# to the o11y appliance alongside pve_exporter metrics.
#
# The LXC is unprivileged, so hardware collectors that need /sys/class/
# raw device access (diskstats, filesystem, hwmon, nvme, rapl, wifi) are
# disabled. The enabled set reflects what is accessible inside an LXC:
#   cpu, loadavg, meminfo, netdev, sockstat, stat, time, uname, vmstat
# ─────────────────────────────────────────────────────────────────────────────
{ ... }:

{
  services.prometheus.exporters.node = {
    enable = true;
    listenAddress = "127.0.0.1";
    port = 9100;

    # Collectors that work inside an unprivileged LXC.
    enabledCollectors = [
      "cpu"
      "loadavg"
      "meminfo"
      "netdev"
      "sockstat"
      "stat"
      "time"
      "uname"
      "vmstat"
    ];

    disabledCollectors = [
      "diskstats"
      "filesystem"
      "hwmon"
      "nvme"
      "rapl"
      "wifi"
    ];
  };
}
