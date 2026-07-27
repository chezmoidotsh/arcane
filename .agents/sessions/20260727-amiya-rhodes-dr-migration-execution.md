# amiya.akn → rhodes.akn DR migration — live execution

## Objective

Execute (not just plan) the reconstruction of `amiya.akn` as `rhodes.akn` (issue #370), following the DR runbook at
`projects/rhodes.akn/docs/disaster-recovery/{README,openbao,pocket-id}.md`. This session tracks the actual run: TODO
list, live-state notes, troubleshooting, and validation — as opposed to
`.agents/sessions/20260720-rhodes-cluster-bringup-planning.md`, which covered the earlier PR-based design work (PR#1-5,
now merged/closed).

## Context & reflections

### Where things stand at session start (2026-07-27, verified live)

- Issue #370 tracks 7 sub-issues in execution order. **#1119 (provision on Omni) and #1120 (CNI/CSI/CCM) are CLOSED.**
  #1121 (bootstrap OpenBao + restore from Garage) through #1125 (ArgoCD last) are still OPEN.
- `kubectl` context `omni-rhodes-akn` is live: 3 nodes Ready (1 control-plane, 2 workers), Talos v1.13.7 / k8s v1.36.3,
  **age 11h** — this is a fresh cluster incarnation, consistent with the recent
  `![project:rhodes.akn]: Repin bootstrap manifest SHA to unblock CNI install` fix (a prior incarnation's Cilium
  bootstrap manifest 404'd on GitHub).
- Live cluster inventory at session start:
  - Namespaces: only `cilium-secrets`, `kube-system`, `kubelet-serving-cert-approver`, defaults — **no** `vault`,
    `pocket-id`, `cert-manager`, `cnpg-system`, `external-secrets-system`, `proxmox`, `external-dns`, `ingress-gateway`.
  - `kube-system`: Cilium (DaemonSet + operator + Envoy) Running, CoreDNS Running, control-plane pods Running.
  - **No Proxmox CCM/CSI pods, no StorageClass** — despite #1120 being closed. Confirmed benign: this cluster
    incarnation hasn't had `README.md` Step 2 (`kubectl apply -f dist/infrastructure/kubernetes/...`) run yet; #1120's
    closure reflects the method being built+validated, not that it's applied to _this_ rebuild.
  - `metrics-server` pod stuck `Pending` — `0/3 nodes are available: 3 node(s) had untolerated taint(s)`. Diagnosed as
    the expected `node.cloudprovider.kubernetes.io/uninitialized` taint (Cilium already tolerates it per the
    `![catalog:talos]: Tolerate uninitialized-cloud-provider taint in Cilium install Job` commit; metrics-server
    doesn't). Self-resolves once the Proxmox CCM runs in Step 2 — not a bug, just where we are in the sequence.
  - **Conclusion: we are positioned right at the start of `README.md` Step 2** (Step 1 done, cluster validated
    Ready/Cilium-healthy).

### Environment fix applied this session

- `kubectl oidc-login` (int128/kubelogin, required by the Omni-issued kubeconfig's exec plugin) was **not installed** —
  `krew` itself had never been bootstrapped (`~/.krew/bin` didn't exist) even though `krew` is an `.mise.toml` tool.
  Fixed by running `krew install oidc-login` directly (bypassing `kubectl krew`, which fails until krew's own first-run
  bootstrap has happened). `export PATH="$HOME/.krew/bin:$PATH"` is needed in any fresh shell until this is folded into
  the standard mise-activated PATH — confirm whether `.mise.toml`'s `KREW_ROOT`/PATH entries already cover this after a
  full `mise install`, or whether every fresh clone needs this manual one-time `krew install oidc-login`.

### Working agreement for this session

- User is executing the DR runbook steps; I act as copilot — tracking the TODO list below, taking notes here as the
  procedure progresses, and doing live troubleshooting/validation against the actual cluster (kubectl/pulumi/cilium)
  rather than guessing from docs alone.
- Live cluster checks use `kubectl --context omni-rhodes-akn ...` (`export PATH="$HOME/.krew/bin:$PATH"` first, see
  above).

## Change history

- [2026-07-27] Session started. Verified current live state (see above). Installed missing `kubectl oidc-login` krew
  plugin. No runbook steps executed yet this session — next action is `README.md` Step 2.
- [2026-07-27] **Executed README.md Step 2** (`kubectl apply -f dist/infrastructure/kubernetes/*`, all 7 dirs, in
  order). Findings, all fixed or logged as expected-transient:
  - **Real gap found & fixed**: rhodes.akn has no `envoy-gateway` (by design — Cilium-only target), so nothing installed
    the upstream Gateway API core CRDs (`GatewayClass`, `Gateway`, `HTTPRoute`, `TCPRoute`, ...) that
    `amiya.akn`/`lungmen.akn` get for free as a side effect of their `envoy-gateway` chart. Fixed by adding the pinned
    upstream bundle as a `resources:` entry in
    `projects/rhodes.akn/src/infrastructure/kubernetes/cilium/kustomization.yaml`:
    `https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/experimental-install.yaml` (experimental
    channel — matches the same v1.5.1 bundle already vendored elsewhere in the repo, needed for `TCPRoute`). Verified
    the URL resolves (200 after redirect) before committing, per the same discipline `OMNI-...03.sha-repin.md`
    established for the Cilium manifest SHA. Re-ran `dist:render`.
  - **`kubectl apply` (client-side) chokes on the `httproutes.gateway.networking.k8s.io` CRD**:
    `metadata.annotations: Too long: may not be more than 262144 bytes` — the CRD's schema exceeds the
    `last-applied-configuration` annotation size limit under client-side apply. **Fixed by switching to
    `kubectl apply --server-side` for every Step 2 command** (upstream Gateway API's own docs recommend this for exactly
    this reason). **TODO: update `README.md`'s Step 2 code block to use `--server-side` everywhere** (not done yet this
    session — flagged by the user mid-drill, still open).
  - **`kubectl`'s discovery-cache is fixed at the start of each `apply -f <dir>` invocation**: any CRD created earlier
    in the _same_ invocation isn't visible yet for a CR later in that same batch (`GatewayClass`, `ClusterIssuer`,
    `ClusterImageCatalog`, `ClusterSecretStore` all hit this once each). Not a bug — just re-run the same
    `apply -f <dir>` a second time (fresh process, fresh discovery) and it resolves. Worth a one-line callout in the
    procedure so it doesn't look alarming during a real drill.
  - **Real gap found & fixed**: none of `proxmox`, `cert-manager`, `cloudnative-pg`, `external-secrets`, `external-dns`,
    `ingress-gateway`'s dist output includes a `Namespace` object (only `cilium` does, because its chart happens to
    create one for `cilium-secrets`) — all of them rely on ArgoCD's `CreateNamespace=true`, which doesn't exist yet at
    this point in the DR chain. **Fixed by creating the 6 namespaces by hand** before applying
    (`kubectl create namespace <ns> --dry-run=client -o yaml | kubectl apply --server-side -f -`), same pattern
    `README.md` Step 3 already uses for `vault`/`pocket-id`. **TODO: add this as an explicit sub-step at the top of
    `README.md` Step 2** (namespaces: `proxmox-system`, `cert-manager-system`, `cloudnative-pg-system`,
    `external-secrets-system`, `external-dns-system`, `ingress-gateway-system`) — not done yet this session, decided to
    document after the live run rather than mid-flight.
  - **Expected/transient, not a bug**: `cert-manager-webhook` and `external-secrets-webhook` pods stay `Pending`
    (`0/3 nodes are available: 3 node(s) had untolerated taint(s)` — same `uninitialized-cloud-provider` taint as
    `metrics-server` at session start) until the Proxmox CCM has run long enough to untaint all 3 nodes. Every resource
    that goes through one of those two webhooks therefore fails on first apply: `ClusterIssuer/letsencrypt`
    (cert-manager), 2× `Certificate` `barman-cloud-client`/`barman-cloud-server` (cloudnative-pg, cert-manager webhook),
    `ClusterSecretStore/vault.chezmoi.sh` (external-secrets), one `ExternalSecret` (external-dns, external-secrets
    webhook), one resource in `ingress-gateway` (cert-manager webhook — likely the Gateway listener's TLS
    `Certificate`). **User confirmed this is expected and already accounted for in the procedure — not something to fix
    now.** These 6 resources need a retry once the CCM has untainted the nodes (check during Step 4's validation, or
    immediately after confirming CCM is `Running` and `kubectl get nodes` shows no more
    `node.cloudprovider.kubernetes.io/uninitialized` taint).

## Change history (cont'd — Step 3 prep)

- [2026-07-27] **Real architecture gap found & fixed**: `rhodes.akn/stack/proxmox.ts` authenticated its
  `proxmox.Provider` using the `rhodes-akn-bootstrap@pve` credential read via a Pulumi `StackReference` to
  `chezmoi-sh-infra` (`getOutput("rhodesAknBootstrapTokenId"/"...Secret")`). This is the **first time this specific
  cross-project secret StackReference has ever been exercised** (introduced 2026-07-26, never run before this drill) —
  and it doesn't work: every project in this repo has its own, unique `PULUMI_CONFIG_PASSPHRASE` (verified by hash
  comparison, no plaintext exposed — all 4 differ), and decrypting a _secret_ StackReference output requires the
  **exporting** stack's passphrase, not the reading stack's. Result: `pulumi up` on `rhodes.akn` elided the secret,
  leaving an empty/malformed Proxmox API token (`the API token must be in the format 'USER@REALM!TOKENID=UUID'`).
  - **User's decision** (discussed at length, see conversation): don't share passphrases across projects (keeps blast
    radius contained — a leaked `rhodes.akn` passphrase must not also expose `chezmoi-sh-infra`'s `root@pam` password).
    Also relevant for the long-term PKO idea (`.agents/sessions/20260720-...`): a future in-cluster operator needs this
    to work without holding two projects' decrypt keys either.
  - **Fix implemented**: `chezmoi.sh/stack/proxmox/access/rhodes-akn-bootstrap.ts` now writes the delegated token
    directly as a Kubernetes `Secret` (`rhodes-akn-bootstrap-pve`, `kube-system` namespace) into `rhodes.akn`'s own
    cluster, via a named `k8s.Provider` using a new **non-secret** config key `rhodesAknKubernetesContext` (set to
    `omni-rhodes-akn`). No more Pulumi StackReference secret output at all — removed the `rhodesAknBootstrapTokenId`/
    `...Secret` exports and `stack/proxmox/index.ts`'s re-export of them.
  - `rhodes.akn/stack/proxmox.ts` now reads that Secret via `k8s.core.v1.Secret.get(...)` (its own default provider,
    same `kubernetes:context` as everything else in the file) instead of the StackReference.
  - Added `@pulumi/kubernetes` to `chezmoi.sh`'s `package.json` (new dependency — it never touched Kubernetes before)
    and to `pnpm-workspace.yaml`'s `onlyBuiltDependencies` (along with `protobufjs`, its transitive dep) — pnpm silently
    ignores postinstall/build scripts for packages not on that allowlist. Both projects typecheck clean.
  - **Operational consequence**: `chezmoi.sh`'s `pulumi up` must run **before** `rhodes.akn`'s from now on (it writes
    the Secret rhodes.akn's provider now depends on) — new ordering dependency between these two stacks that didn't
    exist before.
- [2026-07-27] **Environment hygiene finding**: running raw `pulumi` commands after manually `cd`-ing between project
  directories in a plain shell leaks the _previous_ directory's `PULUMI_STACK`/`PULUMI_CONFIG_PASSPHRASE` env vars
  forward — `mise`'s per-directory env activation only fires on an interactive shell's `cd` hook, not on a bare `cd`
  inside a script/non-interactive shell. This caused most of this session's "no stack selected" and passphrase
  confusion. **Fix: always `eval "$(mise env -s bash)"` immediately after `cd`-ing into a Pulumi project directory**,
  before running any `pulumi` command, in this kind of non-interactive/scripted context.
- [2026-07-27] Both stacks now correctly configured for Step 3:
  - `chezmoi_sh.live`: `rhodesAknKubernetesContext = omni-rhodes-akn`
  - `rhodes_akn.live`: `kubernetes:context = omni-rhodes-akn`, `recovery = true`, `cloudflare_account_id` [secret],
    `cloudflare_zone_id` [secret] (last three set by the user directly, in parallel with this session).
    `pocket_id_oidc_client_secret` still unset (per the stack config file's own TODO — needed later, not blocking Step
    3).
  - User is running `pulumi up` themselves (both stacks) — not run by the assistant this session.

## Change history (cont'd — first `pulumi up` attempt, 4 errors)

- [2026-07-27] User ran `pulumi up` on `rhodes_akn.live` (12 created, 4 errored: Proxmox `VirtualEnvironmentUser` +
  `VirtualEnvironmentRole` both `401 Authentication failed`, Cloudflare `Ruleset` conflict, wrapping `Stack` error).
- **Cloudflare Ruleset conflict — resolved.** `cloudflare-security-auth-chezmoi-sh` (rate-limit for `auth.chezmoi.sh`,
  Pocket-Id's public login endpoint) already existed in `amiya.akn`'s stack (`stack/pocket-id.ts`) — Cloudflare only
  allows one zone-level ruleset per `http_ratelimit` phase, so rhodes.akn's attempt to create a second one conflicted.
  Migrated ownership:
  `pulumi import cloudflare:index/ruleset:Ruleset cloudflare-security-auth-chezmoi-sh "zones/<zoneId>/<rulesetId>"` into
  `rhodes_akn.live` (note the required `zones/{zone_id}/{ruleset_id}` import ID format — the bare ID from
  `pulumi stack export` alone isn't accepted), then `pulumi state delete <urn>` on `amiya_akn.live` (state-only removal,
  real Cloudflare object untouched) and removed the now-dead resource declaration from `amiya.akn/stack/pocket-id.ts`
  (left `export {}` so the file stays a module — `index.ts` re-exports it). Both projects typecheck clean. Pulumi marked
  the imported resource `protect: true` by default — left as-is (sane default for a shared production DNS/security
  resource).
- **Real bug found & fixed: malformed Proxmox API token (root cause of the 401s, not a permissions gap).** SSH'd into
  `root@pve-01.pve.chezmoi.sh` (Proxmox has no in-UI audit log for this) and checked `journalctl -u pvedaemon`:
  `authentication failure: no such user ('rhodes-akn-bootstrap@pve!bootstrap=rhodes-akn-bootstrap@pve')` — the token
  secret sent was the **userId string**, not a UUID. Decoded the live `kube-system/rhodes-akn-bootstrap-pve` Secret to
  confirm: `token-secret` contained `rhodes-akn-bootstrap@pve!bootstrap=5a248db8-...` (the _entire_ `tokenId=secret`
  string), proving `proxmox.UserToken.value` is already the complete, ready-to-use `USER@REALM!TOKENID=SECRET`
  credential — not just the bare secret. The old code (both the original StackReference version and my direct-Secret
  rewrite, which faithfully carried the bug over) re-concatenated `userId!tokenName=value`, producing a doubly-prefixed,
  invalid string. **This bug predates this session** — it was latent in the original 2026-07-26 refactor and never
  caught because this credential path had never been exercised until this drill.
  - Fix: `chezmoi.sh/stack/proxmox/access/rhodes-akn-bootstrap.ts` now writes `rhodesAknBootstrapToken.value` verbatim
    as a single `api-token` Secret key (dropped the separate `token-id`/`token-secret` fields).
    `rhodes.akn/stack/proxmox.ts` reads that one field directly as `apiToken`, no reassembly. Both typecheck clean.
  - Proxmox-side state double-checked via `pveum user/acl/token list` on `pve-01` — the `rhodes-akn-bootstrap@pve` user,
    its `/access`-scoped `Administrator` ACL, and its `bootstrap` token (`privsep=0`) are all exactly as coded. **No
    ACL/permission change was needed** — confirms the earlier "maybe /access isn't enough, might need root /" hypothesis
    was a red herring; don't widen this credential's scope.
  - User still needs to re-run `pulumi up` (chezmoi.sh first, then rhodes.akn) to pick up the fix and retry the Proxmox
    role/user creation.

## Change history (cont'd — second `pulumi up` attempt, 403 on ACL creation)

- [2026-07-27] After the token fix, `pulumi up` on `rhodes_akn.live` got further (User/Role creation succeeded — no more
  401s, confirming the token fix worked) but hit a **real, legitimate 403**:
  `Permission check failed (/nodes/pve-01, Permissions.Modify)` and `(/pool/talos, Permissions.Modify|Pool.Allocate)` —
  `rhodes-akn-bootstrap@pve` (scoped to `Administrator` at `/access` only) tried to grant its own newly-minted
  `kubernetes-cloud-provider@pve` identity ACLs at those two paths (`rhodes.akn/stack/proxmox.ts`'s `aclPaths`), but
  Proxmox correctly refuses to let a user delegate an ACL at a path it has no rights on itself. **Not a bug — an
  inherent gap in the original self-provisioning design**, first surfaced by actually running it.
  - Fix: `chezmoi.sh/stack/proxmox/access/rhodes-akn-bootstrap.ts` adds one narrow custom role
    (`RhodesAknBootstrapDelegate`: `Permissions.Modify` + `Pool.Allocate` only) and two ACL grants for
    `rhodes-akn-bootstrap@pve` — at `/nodes/pve-01` and `/pool/talos` specifically, matching exactly what the 403s
    named. Deliberately not `Administrator` and not scoped to `/` — grants the _ability to assign ACLs_ at those two
    paths, not VM/storage/SDN control itself, preserving the credential's original narrow-scope intent.
  - **Second occurrence of the `token.value` bug found and fixed at its root**, in the shared
    `catalog/pulumi/components/proxmox-cluster-identity` component itself (`tokenSecret = token.value`, same "full
    `id=secret` string instead of bare secret" issue as `rhodes-akn-bootstrap.ts`'s token — this one would have broken
    the actual `proxmox-cloud-provider` CCM/CSI Secret's `token_secret` field once the ACL fix let it get that far).
    Fixed by stripping the `USER@REALM!TOKENID=` prefix in the component itself (single point of truth — fixes every
    current/future consumer, not just this one). Updated the component's mocked unit test to use a realistic
    `id=secret`-shaped mock value and assert the bare secret is what's actually extracted (the old mock/assertion was
    too loose to have ever caught this). `pnpm test` in `catalog/pulumi/components/proxmox-cluster-identity`: 6/6
    passing. Both Pulumi projects typecheck clean.
  - User still needs to re-run `pulumi up` (chezmoi.sh first, then rhodes.akn) again.

## Change history (cont'd — live cluster instability, post Step 2/3)

- [2026-07-27] User reported three symptoms on the live cluster: many `policy denied` in `hubble observe`, core
  Kubernetes workloads "crashing", and the Proxmox CCM stuck unable to pull its image. Live investigation:
  - `hubble observe --verdict DROPPED` was dominated by Cilium's own inter-node `cilium-health` check traffic
    (`remote-node <> health`, port 4240 + ICMP) being dropped — noise/symptom, not an app-level policy misconfiguration.
  - `kube-controller-manager`, `kube-scheduler`, and `cilium-operator` were all losing their leader-election lease
    (`context deadline exceeded` talking to the **local** apiserver proxy at `127.0.0.1:7445`) — 11 restarts each over
    ~10h. `kube-apiserver`'s own healthz reported `[-]etcd failed: reason withheld`.
  - Proxmox CCM: `ImagePullBackOff`, `dial tcp 10.0.0.23:443 (oci.chezmoi.sh): i/o timeout`.
  - Control-plane node was **2 vCPU / ~1.9GB RAM**, single node (no HA), 77%/104% memory requests/limits already
    allocated before most other apps had even scheduled (blocked by the `uninitialized` taint). Working theory at that
    point: resource starvation on an undersized single control-plane node.
  - **User did a brute-force resize to 6 vCPU / 4GB and rebooted the node to test that theory.**
- [2026-07-27] Post-resize results, mixed:
  - Leader-election restarts on `kube-controller-manager`/`kube-scheduler`/`cilium-operator` **stopped** (stable for 6+
    min post-reboot, no new restarts) — partially confirms resource pressure was a real contributing factor for that
    specific symptom.
  - **CoreDNS stayed `0/1 Not Ready` indefinitely** (`kubernetes` plugin can't reach the apiserver). Deployed ephemeral
    `busybox` debug pods (with the uninitialized-taint toleration) to isolate the cause:
    - Same-node pod-to-pod (debug pod co-located with CoreDNS) DNS lookup: **timeout**.
    - Cross-node: **timeout**. External IP (`1.1.1.1:443`): **timeout**. `kube-dns` ClusterIP: **timeout**.
    - Direct node IP:port to the apiserver (`10.128.0.13:6443`, bypassing ClusterIP/service routing entirely): **also
      timeout**.
    - This rules out Cilium service/ClusterIP routing and CiliumNetworkPolicy as the cause (tested from `kube-system`
      with a fully permissive `allow-kube-system-full` policy, still failed identically) — **regular (non-hostNetwork)
      pods have no working egress at all**, to any destination, while hostNetwork static control-plane pods (talking via
      `127.0.0.1`) work fine.
  - `cilium-dbg status`: `KubeProxyReplacement: True [eth1 ... (Direct Routing) ...]` — native routing pinned to a named
    interface (`eth1`) on a **dual-NIC** node. `Cluster health: 1/3 reachable`. `cilium service list` showed `kube-dns`
    backends in `(maintenance)` state — consistent with (i.e. not contradicting) CoreDNS's own not-ready state, not a
    separate bug on its own.
  - **Working hypothesis, not yet verified**: the brute-force resize's reboot may have reordered the node's two NICs
    (udev/PCI re-enumeration on hardware change is a known class of issue), so Cilium is now bound to an interface still
    _named_ `eth1` but no longer the _correct_ physical NIC for pod-network routing — Cilium reports itself healthy
    because it successfully attached to _an_ interface, just not the right one. Would explain total,
    destination-independent pod egress failure with Cilium self-reporting OK.
  - **Blocked on verification**: `talosctl` access has an expired key/cert (separate from `omnictl`, which
    self-refreshed fine mid-session) — couldn't inspect actual interface/MAC state on the node directly. Needs
    `talosctl` re-auth (or checking NIC state some other way) before confirming or ruling out this hypothesis. Cleaned
    up all debug pods (`netdebug`, `netdebug2`, `netdebug3`) after testing.

## Attention points

- `openbao.md`'s Kubernetes auth backend self-heal (Step 6) is **unverified in practice** — tracked separately in #1138.
  This is the first real drill, so its outcome must be recorded in `openbao.md`'s own History section per that doc's own
  instruction.
- Two admin-recovery paths exist for OpenBao (break-glass Pulumi token / Pocket-Id SSO) — if both are ever unavailable,
  recovery is impossible short of a destructive `bao operator init`. Not a blocker now, just the standing risk the DR
  doc itself already documents.
- `pulumi stack` needs an explicit `pulumi stack select` in any fresh shell (no stack selected by default) before Step
  3's `pulumi up --refresh` — confirm the correct stack name when that step is reached.
- Recent commits (`Repin bootstrap manifest SHA`, `Grant rhodes.akn read access to amiya's CNPG backups`) are both
  direct prerequisites already landed for Steps 1-2 and Step 5 (OpenBao CNPG restore needs read access to amiya's
  backups) — nothing further to do on those fronts before proceeding.

## Next steps

- [x] **README.md Step 2** — all 7 `dist/infrastructure/kubernetes/*` directories applied (`--server-side`). 6 resources
      still need a retry once the Proxmox CCM untaints the nodes (see Change history) — do this before or during Step 4,
      whichever comes first
- [x] **Doc follow-up**: updated `README.md` Step 2 — `--server-side` everywhere, namespace-creation sub-step added,
      discovery-cache re-run note and CCM-credential/webhook-dependency callout added, History entry logged
- [ ] Retry the 6 CCM-taint-blocked resources once nodes are untainted: `ClusterIssuer/letsencrypt`,
      `Certificate/barman-cloud-client`, `Certificate/barman-cloud-server`, `ClusterSecretStore/vault.chezmoi.sh`, the
      `external-dns` `ExternalSecret`, the `ingress-gateway` cert-manager-webhook-gated resource
- [ ] **README.md Step 3** — create `vault`/`pocket-id` namespaces, `pulumi config set recovery true`,
      `pulumi up --refresh --parallel 15`
- [ ] **README.md Step 4** — validate cluster (`cilium status --wait`, OMNI-20260721-00 checklist V-001..V-010, ESO +
      CNPG operator pods Running)
- [ ] **README.md Step 5 / issue #1121** — restore OpenBao (`openbao.md` in full); record whether the Kubernetes auth
      backend self-heal (Step 6 of that doc) actually worked, for #1138
- [ ] **README.md Step 6 / issue #1124** — restore Pocket-Id (`pocket-id.md` in full)
- [ ] **README.md Step 7** — `pulumi config set recovery false`, `pulumi up --refresh --parallel 15`
- [ ] **README.md Step 8** — full validation incl. Pocket-Id SSO into OpenBao
- [ ] **README.md Step 9 / issue #1125** — bootstrap ArgoCD (adopts everything above), then restore remaining apps
      incrementally (one PR per app, per #370), DNS cutover, decommission amiya
- [ ] Issues #1122 (ESO bootstrap) and #1123 (cert-manager/external-dns via ESO) are folded into Steps 2-7 above, not
      separate work — close them as part of that chain rather than as standalone tasks
