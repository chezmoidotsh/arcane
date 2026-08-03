# Pangolin organization setup (chezmoi-sh org, sites, public apps)

## Objective

Implement the Pangolin organization in `projects/kazimierz.akn/src/infrastructure/pulumi/`:

- A `chezmoi-sh` Pangolin org with OIDC login via Pocket-Id.
- One Newt "site" (node) each in `rhodes.akn` and `lungmen.akn`.
- Public apps behind the org, full SSO bypass (no auth in front — each app handles its own), geo-blocked for a handful
  of high-risk countries:
  - `auth.chezmoi.sh` → Pocket-Id (rhodes.akn)
  - `streaming.chezmoi.sh` → Jellyfin (lungmen.akn)
  - `photos.chezmoi.sh` → Immich (lungmen.akn)
- Secrets pushed to Vault. Kubernetes-side wiring (Newt deployment in rhodes, HTTPRoute/NetworkPolicy) is explicitly out
  of scope — next PR.
- File org: org/IdP/site management centralized in kazimierz's `stack/pangolin/`; each consuming project owns its own
  app (`Resource`) definitions in its own `stack/pangolin/`.

## Context & reflections

- **Org is brand new**, created via Pulumi (`pangolin.Org`), not adopted from an existing one — user's explicit choice
  when asked.
- **Org subnet/utilitySubnet** (WireGuard overlay, fixed at creation, never modifiable after): settled on
  `172.16.1.0/24` / `172.16.2.0/24`, carved out of the `172.16.0.0/12` block right next to kazimierz's own OCI VCN
  (`172.16.0.0/26`). Same reasoning as that VCN's already-documented overlap-safety in `docs/network/ipam.md`: kazimierz
  sits outside the homelab's L3 topology entirely and this overlay is tunnel-only (WireGuard, never natively routed), so
  overlapping the Kubernetes `172.16.0.0/12` block is safe — unlike reaching into `10.x`/`192.168.x`, which are fully
  claimed by physical VLANs/SDN/LB pools. `ipam.md` updated with a dedicated "Pangolin org overlay" subsection
  (deliberately _not_ merged into the OCI VCN/Subnet table — those are real OCI objects, the Pangolin subnets aren't).
- **Site creation lives in the consuming project** (rhodes.akn/lungmen.akn), not centralized in kazimierz — user pushed
  back on an earlier draft that centralized it; re-reading their original French request ("un noeud **dans** rhodes et
  lungmen") supports this. This also meant dropping a `StackReference` from rhodes/lungmen back to kazimierz entirely,
  since `Site`/`Resource`/`Target`/`ResourceRule` don't take `orgId` as a resource argument at all — only `Org`/`OrgIdp`
  do — so org scoping has to come from the _provider_, not per-resource.
- **No explicit `pangolin.Provider` anywhere, no custom caching-provider helper.** Went through several rounds of
  simplification here (see change history) before landing on the final shape: the `pangolin` package's default provider
  reads its config natively —
  - `pangolin:orgId` and `pangolin:url` as **plain (non-secret) stack config**, matching this repo's existing
    `oci:region` convention, set per-project in each `Pulumi.*.live.yaml` (kazimierz only needs `url`; rhodes/lungmen
    need both `orgId` and `url`).
  - `PANGOLIN_API_KEY` stays **env-var only**, never in Pulumi config — same bootstrap pattern as `POCKET_ID_API_KEY`
    (needs an admin session to exist before a key can even be issued).
- **Domain lookup** (`chezmoi.sh` base domain → Pangolin `domainId`): inlined a one-line `.find()` at each of the 3 app
  call sites rather than a shared lib helper — reviewer feedback was that the abstraction (custom thrown error, JSDoc)
  was heavier than the job needed for 3 call sites.
- **Country geo-block list**: `US, CN, RU, KP, IL` (user-specified) plus `IR, BY, SY` (added by me, flagged as extras,
  user accepted implicitly by not objecting) — each with an inline comment naming the country + why. Lives in
  `catalog/pulumi/lib/src/pangolin.ts` as `HIGH_RISK_COUNTRIES` / `blockHighRiskCountries()`, the one piece of genuinely
  shared logic that survived (unit-tested, `catalog/pulumi/lib/src/pangolin.test.ts`).
- **Provider inheritance**: only the "root" resource in each file passes an explicit provider config point (now: nothing
  explicit at all, see above); sibling resources (`Target`, `ResourceRule`) use `{ parent: <resource> }` rather than
  re-specifying anything, matching the rest of the repo's style (e.g. rhodes' `argocd.ts`).
- **IdP naming**: the `OrgIdp` binding's dashboard display name is `"auth.chezmoi.sh (pocket-id)"`, not just
  `"Pocket-Id"` — ties the entry to the actual endpoint.
- **`chezmoiShOrg.orgId` over a separately-exported `chezmoiShOrgId` constant** — `Org.orgId` is both an input and an
  output; reading it back off the created resource (single source of truth) also creates an implicit dependency, making
  the manual `dependsOn: [chezmoiShOrg]` on the `OrgIdp` unnecessary too.

## Change history

1. Explored existing Pangolin/Pocket-Id Pulumi code (kazimierz's existing `pangolinOidcClient`, rhodes/lungmen's
   `stack/pocket-id/*` pattern), the `@pulumi/pangolin` SDK (`catalog/pulumi/sdks/pangolin/`), Vault-push convention
   (`vaultSecretMetadata()`), and the existing lungmen `newt.externalsecret.yaml` — which fixed the exact Vault path
   convention (`shared/third-parties/pangolin/newt/<cluster>.akn`, keys `endpoint`/`token_id`/`token_secret`).
2. Asked the user: adopt an existing Pangolin org vs. create a new one → **create new**, needed subnet input.
3. First implementation pass: org/idp/sites centralized in kazimierz (`stack/pangolin/`), apps in rhodes.akn/lungmen.akn
   (`stack/pangolin/`), shared `pangolinProvider()`/`chezmoiShDomainId()`/`newtSite()` helpers in `catalog/pulumi/lib`.
   Subnet picked as `192.168.90.0/24`/`.91.0/24` (later revised).
4. **Review round 1** (plannotator): questioned the `chezmoiShDomainId()` abstraction, the `192.168.x` subnet choice
   (reviewer wanted `10.x`, reserving `192.168.x` for home LAN), whether site creation belonged in kazimierz at all, and
   the repeated `{ provider: pangolinProvider() }` calls. Triaged and discussed before applying: agreed to inline the
   domain lookup, agreed to move site creation to rhodes/lungmen (dropping the `StackReference` entirely), agreed to use
   `{ parent }` inheritance instead of repeated provider calls, and — after checking `docs/network/ipam.md` — proposed
   `172.16.1.0/24`/`.2.0/24` (overlapping the OCI/Kubernetes block, consistent with the existing kazimierz-VCN
   precedent) instead of `10.x`. User confirmed all three.
5. **Review round 2**: `idp.ts`'s IdP name → `"auth.chezmoi.sh (pocket-id)"` (applied); `ipam.md`'s new rows were "pas
   clair de ouf" (unclear) — split into their own subsection, not merged into the OCI VCN/Subnet table; one empty-body
   annotation on `pangolin.ts` turned out, per the user's next message, to mean "remove `newtSite()`, too verbose for
   one resource" — removed, inlined `new pangolin.Site(...)` directly at both call sites.
6. User then asked directly: **"pourquoi tu setup le provider en fait ? C'est la seule fois où tu le fais"** — good
   catch. Checked `catalog/pulumi/sdks/pangolin/provider.ts`: the bridged provider reads
   `PANGOLIN_URL`/`PANGOLIN_API_KEY`/`PANGOLIN_ORG_ID` from the environment for its _default_ provider natively — no
   explicit `Provider` resource needed anywhere. Removed `pangolinProvider()` from lib entirely and every explicit
   provider construction/reference across all 3 projects.
7. **Review round 3**: `idp.ts` should read `orgId: chezmoiShOrg.orgId` instead of a separately-exported
   `chezmoiShOrgId` constant (single source of truth + implicit dependency, drops the manual `dependsOn` too); `org.ts`
   no longer needs to export that constant at all. Applied.
8. User asked to run `pulumi up`. Checked env: `PANGOLIN_API_KEY`, `POCKET_ID_API_KEY`, `VAULT_TOKEN` all unset in my
   session; explained I can't safely receive secrets through this chat and pointed at the standard `preview` → `up`
   sequence for the user to run themselves, kazimierz first (org must exist before rhodes/lungmen can reference
   `pangolin:orgId: chezmoi-sh`).
9. User asked to move `orgId` into plain stack config for the non-kazimierz projects → added
   `pangolin:orgId: chezmoi-sh` to rhodes/lungmen's `Pulumi.*.live.yaml` (matching the `oci:region` convention already
   in this repo). Then asked to do the same for `url` → added `pangolin:url: https://kazimierz-akn.tail831c5d.ts.net` to
   **all three** projects' live config.
10. User ran `pulumi up` themselves (kazimierz). Hit a plugin-resolution error — see Attention points.
11. New session, `/clear`'d. Re-investigated the plugin error: `openapi-provider v0.8.3` actually resolves fine from the
    local cache via `mise run pulumi:diff` — the earlier 403 looks transient or specific to running `pulumi up` outside
    the `mise` task context, not reproduced. Preview then failed for a different, real reason: kazimierz's
    `Pulumi.kazimierz_akn.live.yaml` was missing `pangolin:orgId: chezmoi-sh` (rhodes/lungmen already had it) — the
    Pangolin provider's `Configure()` requires `org_id` even for the stack meant to create that org. Added it.
12. With `orgId` set, preview got further but `Org` creation itself now 404s:
    `Organization chezmoi-sh was not found on the target Pangolin instance`. Checked Pangolin's real API source
    (`fosrl/pangolin`): org creation is `PUT /org` with `orgId` in the body, no path segment — creation shouldn't
    require the org to pre-exist. But the Terraform provider bridge (`registry.opentofu.org/stackopshq/pangolin`) runs a
    preflight org*id-exists check at `Configure()` time for \_every* resource, including `Org` itself, before any
    Create/Read/Update. Structurally blocks bootstrapping a brand-new org through this provider — `orgId` unset →
    immediate "Missing Org ID"; `orgId` set → 404 since it doesn't exist yet. Documented as a code comment in
    `stack/pangolin/org.ts`.
13. User created the `chezmoi-sh` org manually via the Pangolin web UI (same orgId, so it lines up with the
    `orgId: "chezmoi-sh"` already hardcoded in `org.ts`) to work around the provider limitation.
14. Ran `pulumi import pangolin:index/org:Org chezmoi-sh chezmoi-sh` for kazimierz. First attempt (no flags, default
    preview) hit the `openapi-provider` 403 again; a `--preview-only` run right after succeeded cleanly
    (`1 to import, 33 unchanged`). Re-ran with `--yes` while resolution was warm: succeeded
    (`1 imported, 33 unchanged`). Follow-up `pulumi preview` (kazimierz) clean:
    `2 to create, 2 to update, 31 unchanged`.
15. User hit the same 403 again running raw `pulumi up` directly (not through a `mise` task). Initially guessed
    unbounded default parallelism (vs. the `mise` tasks' `--parallel 15`) widened a plugin-lock race — **wrong**. User
    found the real cause: a stray `PULUMI_HOME` set in their shell, pointing away from `~/.pulumi` where
    `resource-openapi-provider-v0.8.3` is actually cached — so every raw invocation forced a network re-download that
    403s, while every `mise run pulumi:*` invocation in this session happened to have `PULUMI_HOME` unset (defaulting
    correctly to `~/.pulumi`). Not a race, not a `mise`-task-specific fix — just point `PULUMI_HOME` at the right place
    (or unset it) in any shell running `pulumi` directly for this repo.

## Attention points

- **Resolved: plugin-resolution 403.** Root cause was a stray `PULUMI_HOME` in the user's shell pointing away from
  `~/.pulumi`, where `resource-openapi-provider-v0.8.3` is actually cached — see change history #15. Fixed by
  correcting/unsetting `PULUMI_HOME`, not a `mise`-vs-raw-CLI or parallelism issue.
- **Resolved: Pangolin org bootstrap.** The `stackopshq/pangolin` Terraform bridge can't create a brand-new org (see
  change history #12) — worked around by creating `chezmoi-sh` manually via the Pangolin web UI, matching the `orgId`
  already hardcoded in `org.ts`. Comment left in that file so a future edit doesn't retry native creation.
- **Unverified assumption, now baked into checked-in config across all 3 projects**:
  `pangolin:url: https://kazimierz-akn.tail831c5d.ts.net`. This was inferred from an unrelated ARA-server tailnet
  example in the Ansible role, never confirmed against the real Pangolin integration-API tailnet hostname. Confirm
  before relying on it.
- **Outstanding Ansible prerequisite, outside this PR's scope**: the `chezmoi.sh` base domain (not just
  `pangolin.chezmoi.sh`) needs to be in `pangolin_domains` in kazimierz's Ansible host_vars before the rhodes/ lungmen
  domain lookup (`pangolin.getDomainsOutput().apply(r => r.domains.find(...)!.domainId)`) will succeed — otherwise it
  throws at apply time (non-null assertion on a missing find).
- Kubernetes-side work (Newt deployment in rhodes, HTTPRoute/NetworkPolicy for the 3 apps) is deliberately deferred to a
  follow-up PR per the user's original request.

## Next steps

- [x] `pulumi import pangolin:index/org:Org chezmoi-sh chezmoi-sh` in kazimierz — done, org now under Pulumi management,
      `pulumi preview` clean (2 to create, 2 to update, 31 unchanged).
- [ ] Confirm the real Pangolin integration-API tailnet hostname before trusting `pangolin:url` in the 3 live config
      files.
- [ ] Add `chezmoi.sh` to `pangolin_domains` in kazimierz's Ansible host_vars (prerequisite for rhodes/lungmen resource
      creation to succeed).
- [ ] `pulumi up` for kazimierz (org/IdP) — run by the user directly in their own terminal.
- [ ] Then rhodes.akn and lungmen.akn: same `pangolin:orgId`/`pangolin:url` pattern, no `Org` resource involved there
      (sites/resources only), so the bootstrap-order issue shouldn't recur — but retry once if the
      `openapi-provider`/`terraform-provider` plugin flakes, same as kazimierz.
- [ ] Kubernetes-side follow-up PR: Newt deployment in rhodes.akn (lungmen's already exists), HTTPRoutes and
      NetworkPolicies for `auth`/`streaming`/`photos`.
