# Migration: amiya.akn → rhodes.akn (core platform)

This migrates the core-platform role (OpenBao, Pocket-Id, ArgoCD hub) from `amiya.akn` to `rhodes.akn`. It follows the
[Rhodes·AKN Disaster Recovery](../../projects/rhodes.akn/docs/disaster-recovery/README.md) chain almost exactly — same 9
steps, same order, same tooling — because `rhodes.akn`'s DR procedure was written for this migration in the first place:
`amiya.akn` becoming unreachable and `amiya.akn` being decommissioned in favor of `rhodes.akn` are the same event from
the new cluster's point of view. Follow that document step by step; this page only covers where this migration actually
diverges from a genuine DR drill.

## Step 1 — this is a real first run, not a recreation

DR's Step 1 assumes the cluster template and machine classes already existed and are being re-applied after a loss.
Here, `projects/rhodes.akn/src/infrastructure/omni/rhodes.clustertemplate.yaml` is being applied for real for the first
time — it was drafted proactively on 2026-07-23, ahead of this migration (see that file's own history and
[README.md's History](../../projects/rhodes.akn/docs/disaster-recovery/README.md#history)).

> [!NOTE] The action itself is identical to DR's own Step 1: apply the cluster template via `omnictl`, following
> [OMNI-20260721-00](../procedures/omni/OMNI-20260721-00.omni-cluster-creation.md) through its CNI/CSI/CCM validation
> checklist. `rhodes.akn` is already allocated cluster ID 1 / pod CIDR `172.30.0.0/19` in
> [docs/network/ipam.md](../network/ipam.md) — that decision predates this migration and needs no revisiting here.

## Step 2 (openbao.md / pocket-id.md) — CNPG restore already points at amiya's backups

Informational only — nothing to do here beyond following the linked procedures as written.

Both `projects/rhodes.akn/src/apps/vault/cnpg.cluster.yaml` and
`projects/rhodes.akn/src/apps/pocket-id/cnpg.cluster.yaml` already have `spec.bootstrap.recovery.source` and
`spec.externalClusters[].plugin.parameters.barmanObjectName` set to `amiya-akn`, not `selfhosted`. That `ObjectStore`
(`cnpg.objectstore.amiya-akn.yaml` in each app's directory) targets `s3://cnpg-amiya-akn/{openbao,pocket-id}` —
`amiya.akn`'s own Garage S3 backups, not `rhodes.akn`'s own (`cnpg.objectstore.yaml`, `selfhosted`).

This means when walking `openbao.md`/`pocket-id.md` Step 2 —
[DB-20260723-00](../procedures/databases/DB-20260723-00.cnpg-restore-from-object-store.md) — for this migration, the
manifests already resolve against the right source. There is nothing to edit; just verify the restore against the
`amiya-akn` `externalClusters` entry instead of assuming `rhodes.akn`'s own object store, as DB-20260723-00 generically
does.

## Between DR Steps 5/6 and Step 9 — validate over real HTTPS via `/etc/hosts`

Follow the DR's own
[Between Steps 6 and 9 — validate over real HTTPS via `/etc/hosts` section](../../projects/rhodes.akn/docs/disaster-recovery/README.md#between-steps-6-and-9---validate-over-real-https-via-etchosts-optional)
as written — same entries, same IP.

> [!IMPORTANT] There, it's optional (production DNS already targets `rhodes.akn` since it's the same cluster being
> recovered). Here, it's mandatory: DNS for both hostnames still resolves to `amiya.akn` until the cutover below, so
> this is the only way to reach `rhodes.akn`'s instances at all before that point, not just a convenience.

Remove these entries only once the real DNS cutover below is confirmed working — do not leave them in place
indefinitely.

## DNS cutover — handing `vault.chezmoi.sh` / `auth.chezmoi.sh` from amiya to rhodes

`amiya.akn` publishes both hostnames two ways today: `external-dns-unifi` (LAN-only,
`txtOwnerId: external-dns.amiyaakn`, `policy: sync`) and `cloudflare-operator` + `cloudflare-public-gateway` (public
Cloudflare DNS — genuinely internet-reachable). `rhodes.akn` only has `external-dns-unifi`
(`txtOwnerId: external-dns.rhodesakn`, `policy: sync`) and `external-dns-bind` (talosnet-internal split-horizon only) —
there is no `cloudflare-operator` / `cloudflare-public-gateway` component on `rhodes.akn`.

> [!IMPORTANT] This is an intended behavior change, not a gap to fill in later: after this migration, `vault.chezmoi.sh`
> and `auth.chezmoi.sh` become LAN (VLAN 5) / Tailscale-only — no longer reachable from the public internet. If a
> public-facing entry point is wanted again later, that's a separate piece of work, out of scope here.

Because `amiya`'s and `rhodes`'s `external-dns-unifi` instances use different `txtOwnerId` values, neither one will ever
delete a record it doesn't own — the
[TXT registry's](https://kubernetes-sigs.github.io/external-dns/latest/docs/registry/txt/) ownership model rules out
accidental deletion entirely. The real risk is different: both run `policy: sync`, so while both clusters' `HTTPRoute`s
for the same hostname exist at once, each instance keeps re-asserting _its own_ cluster's IP on every reconcile loop — a
last-writer-wins flapping race, not a deletion risk. `--migrate-from-txt-owner` is explicitly flagged unsafe by upstream
for exactly this dual-owner-in-one-zone case, so the safe cutover is to decommission amiya's claim on the hostname
before or atomically with rhodes's:

1. Confirm rhodes's own `HTTPRoute`s for `vault.chezmoi.sh`/`auth.chezmoi.sh` are already applied and healthy — they
   are, by DR Step 9 (ArgoCD adopts `dist/apps/{vault,pocket-id}/`).
2. Remove/scale down amiya's `vault`/`pocket-id` Applications (or at minimum their `HTTPRoute`s), so amiya's
   `external-dns-unifi` retracts its owned A/TXT records for both hostnames.
3. Confirm rhodes's `external-dns-unifi` then asserts the record pointing at rhodes's Gateway IP — it was likely already
   trying to, intermittently, since Step 9; this just stops the fight.
4. On the public Cloudflare side, there's nothing to create on rhodes — decommissioning amiya's
   `cloudflare-operator`-managed records for these two hostnames (part of amiya's own decommission) simply drops public
   reachability, matching the intended LAN/VPN-only end state above.
5. Verify resolution from a few vantage points (a LAN client via UniFi DNS, and `dig`/`curl` against `ns.chezmoi.sh` for
   the internal split-horizon zone) now returns rhodes's IP before moving on.

## After cutover — remove the hosts overrides and re-provision lungmen's Vault backend

Remove the temporary `/etc/hosts` entries added above.

`lungmen.akn` depends on `amiya.akn`'s OpenBao for its own ESO auth backend/KV mount, via
`projects/lungmen.akn/src/infrastructure/pulumi/stack/vault.ts` (`new ClusterVaultComponent("lungmen.akn", {...})`),
provisioned against whatever Vault instance the Pulumi Vault provider currently points at. Once `vault.chezmoi.sh`
resolves to rhodes (previous section done), re-run lungmen's own Pulumi stack so it (re)creates lungmen's mount,
policies, Kubernetes auth backend, and ESO role on rhodes's OpenBao instead of amiya's:

```sh
cd projects/lungmen.akn/src/infrastructure/pulumi
pulumi up --refresh --parallel 15
```

Verify with `kubectl get externalsecret -A` on `lungmen.akn`'s own context — all should report `SecretSynced` afterward.

---

## References

- [Rhodes·AKN Disaster Recovery](../../projects/rhodes.akn/docs/disaster-recovery/README.md) — the 9-step chain this
  migration follows
- [OpenBao Disaster Recovery](../../projects/rhodes.akn/docs/disaster-recovery/openbao.md),
  [Pocket-Id Disaster Recovery](../../projects/rhodes.akn/docs/disaster-recovery/pocket-id.md) — component-specific
  restore steps
- [OMNI-20260721-00: Talos cluster bring-up on Proxmox](../procedures/omni/OMNI-20260721-00.omni-cluster-creation.md) —
  cluster provisioning (Step 1)
- [DB-20260723-00: Restore a CNPG cluster from its S3 object-store backup](../procedures/databases/DB-20260723-00.cnpg-restore-from-object-store.md)
  — the generic CNPG restore procedure used by `openbao.md`/`pocket-id.md` Step 2
- [ADR-014: Homelab network topology (dual-NIC + SDN VNet)](../decisions/014-network-topology.md) — pod CIDR allocation
  referenced in Step 1
- [docs/network/ipam.md](../network/ipam.md) — pod CIDR, Cilium LoadBalancer pool allocations
- [external-dns TXT registry](https://kubernetes-sigs.github.io/external-dns/latest/docs/registry/txt/) — ownership
  model behind the DNS cutover section

## History

- _2026-07-29_: Initial creation.
- _2026-07-30_: The `/etc/hosts` real-HTTPS validation step turned out not to be migration-specific — moved its content
  into the DR's own README.md (Between Steps 6 and 9), this page now only documents why it's mandatory here (DNS still
  points at `amiya.akn`) instead of merely optional as in a genuine DR.
