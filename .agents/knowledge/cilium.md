# Cilium — Agent knowledge

Distilled from incident post-mortems. Each bullet stands alone.

## Datapath / BPF

* `bpf.enableTCX: false` forces legacy TC attach (`cls_bpf` interface); `true` uses TCX (Linux 6.6+).
* On `amiya.akn` (Linux 6.18.33-talos + Realtek RTL8168 NIC `enp1s0`, driver `r8169`, PCI `10EC:8168`), Cilium 1.19.4 BPF programs `cil_from_netdev` / `cil_to_netdev` attaching via legacy TC cause **total connectivity loss within \~28ms**. Stay on 1.18.10 on this hardware until verified.
* `r8169` driver lacks native XDP — Cilium falls back to SKB-mode processing. This exercises a different code path than the documented native-XDP test matrix (Mellanox mlx4/mlx5, Intel ixgbe, Broadcom bnxt, virtio-net).
* Cilium's upstream hardware/kernel CI matrix is **not publicly documented**. r8169 + kernel 6.18.x coverage is unverified — never assume a minor-version upgrade is safe on this hardware.

## Upgrade procedure (on amiya.akn)

* Rollback path: revert image tag in `kustomization.yaml` to `quay.io/cilium/cilium:v1.18.10` + node reboot. BPF state cleanup (`cleanBpfState: true`) is **not** required.
* Before any Cilium minor upgrade: `talosctl logs -f` to a captured file **before** rolling out the new agent. Without captured logs the post-mortem cannot reconstruct the crash window.
* Hibernate CNPG clusters before any risky Cilium upgrade on `amiya.akn` — connectivity loss severs iSCSI sessions and risks PostgreSQL corruption.

## Platform-cluster context

* `amiya.akn` is the homelab platform SPOF — its Cilium upgrades take OpenBao, Pocket-Id, and Zot offline for every downstream cluster. Treat upgrades with lower risk tolerance than any application cluster.

## Upstream tracking

* `cilium/cilium#46010` — known BPF instability on physical hardware. Subscribe / watch for r8169 / kernel 6.18 fixes before any 1.19.x retry.

## Sources

* `docs/incidents/2026-05-27-cilium-1.19-upgrade-failure.md`
