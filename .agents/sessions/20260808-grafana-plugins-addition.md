# Grafana plugins addition — survey

## Objective

Survey the 14 Grafana plugins the user wants added to the `grafana` instance on `rhodes.akn` (grafana-operator v5.24.0,
`projects/rhodes.akn/src/infrastructure/kubernetes/o11y/grafana.instance.yaml`) for functional status and safety, before
drafting the actual installation PR. Research only — no manifest changes in this pass.

## Context & reflections

### Mechanism note (affects how the eventual PR is built, not covered further here)

grafana-operator v5 has no global "install these plugins" field on the `Grafana` CR. Panel plugins are declared
per-dashboard via `GrafanaDashboard.spec.plugins` (name + version), which triggers the operator to fetch and install
them. The four **ADMIN**-tagged entries (Advisor, Assistant, LLM, Synthetic Monitoring) are **app plugins**, not panels
— they aren't attached to a dashboard and need `GF_INSTALL_PLUGINS` on the deployment container plus, for Advisor, a
feature toggle (`grafanaAdvisor`). That's a different code path from the ten panel plugins and a larger blast radius
(instance-wide deployment env change vs. one dashboard resource) — worth flagging to the user before scoping the PR.

Grafana version actually deployed by the operator isn't pinned anywhere in the repo (no image tag on the Grafana CR's
`deployment.spec`), so it tracks whatever grafana-operator v5.24.0 defaults to. Current upstream stable is **13.1.x**
(Aug 2026). Several plugins below gate on Grafana ≥12/≥13 — confirm the actual running version
(`kubectl -n o11y-system exec deploy/grafana -- grafana-server -v` or similar) before committing to those.

### Verdicts up front

| Plugin                   | Verdict                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| Sierra Plot              | **Do not use as-is** — 4.5 years stale, built for Grafana 7                      |
| Grafana Assistant        | **Blocked** — needs a Grafana Cloud account/subscription this repo doesn't have  |
| Synthetic Monitoring     | **Blocked** — same Grafana Cloud dependency                                      |
| Compact Hostmap panel    | Caution — stale, redundant with Host Overview                                    |
| HPE Clusterview          | Caution — stale, purpose-built for HPC/Slurm fleets, not this homelab's workload |
| Mosaic                   | Caution — 3 years stale                                                          |
| Bubble Chart             | Caution — 2.5 years stale                                                        |
| Percentage Trend         | Caution — stale but low-risk (small surface area)                                |
| Calendar Heatmap         | OK, but pinned to a narrow Grafana version range — verify fit                    |
| Host Overview panel      | OK — actively maintained                                                         |
| MapGL                    | OK — actively maintained, some features may be paid-tier                         |
| Service Dependency Graph | OK — company-backed, moderately fresh                                            |
| Grafana Advisor          | OK, but is an app plugin needing a feature toggle, not a simple panel install    |
| LLM                      | OK — official, free, low risk; needs an API key secret to do anything            |

### Per-plugin detail

**1. Host Overview panel** — _"vue des hosts/DB"_ (TEST)

- Catalog ID: `taminomara-hostoverview-panel`
- Publisher: taminomara (individual) · Community-signed · v1.2.0, updated 2026-06-10
- Requires Grafana ≥12.0.10
- Not deprecated, no known CVEs
- **Verdict: OK.** Actively maintained, modern Grafana 12 target, matches the stated use case well (fleet/host status
  grid with grouping, coloring, sparklines).

**2. Bubble Chart** — _"representation de chaque cluster en NS"_ (TEST)

- Catalog ID: `digrich-bubblechart-panel`
- Publisher: Digvijay Richhariya (individual) · Community-signed · v2.0.1, updated 2024-01-25 (~2.5y stale)
- Requires Grafana ≥10.0.0
- No known CVEs; single maintainer, no activity since early 2024
- **Verdict: Usable with caution.** Signed, no red flags, but unmaintained for 2.5 years — smoke-test against the
  actually-deployed Grafana version before relying on it for real dashboards.

**3. Calendar Heat Map** — _"representation de changements/alertes dans le temps"_ (TEST)

- Catalog ID: `tim012432-calendarheatmap-panel` — **name is ambiguous**: at least two other "calendar heatmap"-style
  plugins exist (`NeoCat/grafana-cal-heatmap-panel`, `volkovlabs-calendar-panel`). Picked
  `tim012432-calendarheatmap-panel` as the closest catalog match to "calendar heat map"; confirm with the user this is
  the intended one before installing.
- Publisher: tim012432 · Community-signed, free · v1.1.1, updated 2026-05-08 (fresh)
- Requires Grafana `>=12.1.7 <12.2 || >=12.2.5` — a narrow, specific patch-range pin, not a simple floor. Worth
  double-checking the deployed Grafana patch version actually falls inside these ranges.
- **Verdict: OK with caution** on the version-range fit specifically.

**4. Compact Hostmap panel** — _"visualisation des hosts"_ (TEST)

- Catalog ID: `zestairlove-compacthostmap-panel`
- Publisher: zestairlove (individual) · Community-signed, free · v0.9.2 (never reached 1.0), updated 2024-01-19 (~2.5y
  stale)
- Requires Grafana ≥8.3.0
- **Verdict: Caution.** Stale and never left pre-1.0. Functionally overlaps with Host Overview panel (#1), which is
  actively maintained — likely redundant if #1 already covers the need.

**5. HPE cluster** — _"visualisation des hosts"_ (TEST)

- Catalog ID: `hpehpc-grafanaclusterview-panel` ("HPE Clusterview")
- Publisher: hpehpc (HPE's HPC org) · Community-signed · v1.3.2, updated 2024-05-29 (~2y stale)
- Requires Grafana ≥9.3.16
- **Verdict: Caution / likely wrong fit.** This is purpose-built for HPC cluster / Slurm node grids at HPE, not general
  host visualization — the name matches but the intended workload doesn't overlap with this homelab. Also overlaps with
  #1 and #4.

**6. mapgl** — _"visualisation de graph"_ (TEST)

- Catalog ID: `vaduga-mapgl-panel`
- Publisher: Vadim Pyatakov · Community-signed · v2.9.0, updated **2026-08-05** (3 days before this survey — very
  actively maintained)
- Requires Grafana ≥11.6.0
- Core plugin is free; a paid "full version" trial is advertised separately (mapgl.org) for extra features
- **Verdict: OK.** Fresh, signed, no red flags. Confirm the dashboards planned don't need the paid-tier features before
  committing.

**7. mosaic** — _"Visualisation de host"_ (TEST)

- Catalog ID: `boazreicher-mosaicplot-panel`
- Publisher: boazreicher (individual — same author as Sierra Plot, #10) · Community-signed, free · v1.0.18, updated
  2023-07-11 (~3y stale)
- Requires Grafana ≥8.0.0
- **Verdict: Caution.** Actually a heatmap/mosaic-plot visualizer for large datasets, not specifically host-shaped data
  — the stated use case ("Visualisation de host") may not match what this plugin actually renders. Confirm intent with
  the user, and test against modern Grafana since it targets an 8.x baseline.

**8. Percentage Trend** — (TEST)

- Catalog ID: `nikosc-percenttrend-panel`
- Publisher: Niko Schmuck (individual) · Community-signed · v1.0.8, updated 2024-02-01 (~2.5y stale)
- Requires Grafana ≥8.1.0
- One open community-forum bug report ("selected series are not available")
- **Verdict: Usable with caution.** Stale but low-risk — it's a thin variant of the core Stat panel (small surface
  area). Check the open forum bug before depending on it.

**9. Service Dependency Graph** — _"visualisation service"_ (TEST)

- Catalog ID: `novatec-sdg-panel`
- Publisher: Novatec Consulting GmbH (company-backed, not a solo dev) · Community-signed · v4.2.0, updated 2025-04-11
  (~1.3y — moderately fresh, four major versions of iteration)
- Requires Grafana ≥10.4.0
- **Verdict: OK.** Company-maintained with a real version history; best-maintained of the niche panel plugins in this
  batch.

**10. Sierra Plot** — (TEST)

- Catalog ID: `boazreicher-sierraplot-panel`
- Publisher: boazreicher (same author as Mosaic, #7) · Community-signed · v1.0.14, updated **2022-02-03 (~4.5 years
  stale — oldest in this batch)**
- Requires Grafana ≥7.0.0 only — no evidence it's ever been tested against Grafana 10/12/13
- **Verdict: Do not use as-is.** Most neglected plugin surveyed. If genuinely needed, sandbox-test first; otherwise drop
  from scope. User gave no stated use case for this one beyond the TEST tag — worth confirming it's actually wanted.

**11. Grafana Advisor** — (ADMIN)

- Catalog ID: `grafana-advisor-app`
- Publisher: **Grafana Labs (official)**, free, no entitlement · v1.0.2, updated 2026-07-14 (public preview, very
  recent)
- Requires the `grafanaAdvisor` feature toggle enabled on the Grafana instance (not just plugin install)
- Requires Grafana `>=12.3.0-0 <12.4.0 || >=12.4.1-0` — this range looked truncated on fetch; re-verify against the
  actually-deployed version before relying on it
- Optionally uses the LLM app (#13) if installed, to generate suggestion text
- **Verdict: OK,** but it's an official admin app plugin, not a panel — install path and blast radius differ from the
  ten panels above (see mechanism note).

**12. Grafana Assistant** — (ADMIN)

- Catalog ID: `grafana-assistant-app`
- Publisher: Grafana Labs (official) · v2.0.46, updated 2026-08-05 (3 days before this survey)
- **Requires a Grafana Cloud account/subscription to function** — it's built into Grafana Cloud; the self-managed app
  plugin is a thin client that connects to a Cloud stack, not a standalone feature. Nothing in this repo references a
  Grafana Cloud stack for `rhodes.akn`.
- Requires Grafana ≥13.0.0-0
- **Verdict: Blocked.** Installing the plugin alone gives no functionality without first deciding to sign up for and
  connect a Grafana Cloud stack — that's a separate decision from "add a plugin," needs the user's call before it goes
  in the PR.

**13. LLM** — (ADMIN)

- Catalog ID: `grafana-llm-app`
- Publisher: Grafana Labs (official), free/open source · v1.0.8, updated 2026-04-17
- Acts as a proxy — needs an OpenAI-compatible API key supplied by the user to do anything; no built-in model
- Requires Grafana ≥9.5.2 (easily satisfied)
- **Verdict: OK.** Official, free, low compat risk. Needs a secret (API key) provisioned through OpenBao/ExternalSecret
  per this repo's convention before it's functional — a real prerequisite, not a blocker. Also a soft dependency of
  Advisor (#11) for AI-generated suggestions.

**14. Synthetic Monitoring** — (TEST, though functionally this is an ADMIN-style app plugin)

- Catalog ID: `grafana-synthetic-monitoring-app`
- Publisher: Grafana Labs (official) · v1.57.1, updated 2026-07-27
- **Requires a Grafana Cloud account** — publishes check results to Grafana Cloud Prometheus/Loki, doesn't support local
  storage. Same blocker as Assistant (#12): no Grafana Cloud stack referenced anywhere in this repo for `rhodes.akn`.
- Requires Grafana ≥13.0.0-0
- Security note (not directly blocking): a critical Chromium RCE chain (CVE-2025-5959, CVE-2025-6554, CVE-2025-6191,
  CVE-2025-6192) was fixed in the separate self-hosted **Synthetic Monitoring Agent** binary (private-probe runner) in
  v0.38.3 — this only matters if a private probe is ever self-hosted; the app plugin itself isn't implicated.
- **Verdict: Blocked**, same reason as Assistant — no Grafana Cloud account to connect to.

## Change history

- 2026-08-08 — Initial survey of all 14 plugins via grafana.com catalog + web search. No manifests touched.

## Attention points

1. **Two ADMIN-tagged plugins (Assistant, Synthetic Monitoring) can't function at all** without a Grafana Cloud
   subscription this repo has no evidence of having. That's a scope decision for the user, not an engineering task —
   don't build these into the PR until resolved.
2. **Sierra Plot is 4.5 years stale** with a Grafana-7 compatibility floor and no stated use case from the user beyond
   its TEST tag — highest-risk item in the batch, confirm intent before including.
3. **App plugins (Advisor, Assistant, LLM, Synthetic Monitoring) use a different install mechanism** than the ten panel
   plugins under grafana-operator (deployment-level `GF_INSTALL_PLUGINS` env / feature toggles, vs.
   per-`GrafanaDashboard` `spec.plugins`) — the eventual PR likely splits into two distinct changes, not one uniform
   "add plugins" diff.
4. **Three panels (Compact Hostmap, HPE Clusterview, Mosaic vs. Host Overview) target overlapping use cases**
   ("visualisation des hosts") — worth picking one rather than installing all three, since the stale ones (#4, #5) don't
   obviously add anything Host Overview (#1, actively maintained) doesn't already cover.

## Decisions (2026-08-08, user)

- **Synthetic Monitoring — dropped.** No Grafana Cloud stack, no plan to get one for this purpose.
- **Grafana Assistant — kept, but blocked on an external prerequisite.** Confirmed via
  [Grafana's own self-managed docs](https://grafana.com/docs/grafana-cloud/machine-learning/assistant/self-managed/) and
  [a third-party writeup](https://rudimartinsen.com/2026/07/16/grafana-assistant-oss/) that even self-hosted, Assistant
  forwards every request to a connected Grafana Cloud stack for processing — configuring a local LLM via the LLM app
  (#13) does not substitute for this, they're separate features. User intends to create a Grafana Cloud account to
  unblock it. That account creation/connection is an external, user-driven action (likely billing-relevant) — out of
  scope for this repo's PR until it exists. Assistant install/config is a **fast-follow once the Cloud account is
  connected**, not part of the initial PR.
- **Sierra Plot — dropped.** No stated use case, 4.5y stale, Grafana-7 floor.
- **Host-visualization overlap (Host Overview / Compact Hostmap / HPE Clusterview) — keep all three.** User wants to
  evaluate them side by side rather than pre-picking one; the PR should carry the staleness/fit caveats from this survey
  (see per-plugin detail above) so the choice is informed, not blind.

## Next steps

- [ ] Confirm the actually-deployed Grafana version on `rhodes.akn` against the version floors above (Calendar Heatmap's
      narrow range, Advisor's ambiguous range)
- [ ] Confirm `tim012432-calendarheatmap-panel` is the intended "calendar heat map" plugin, not one of the other catalog
      candidates
- [ ] Decide on an OpenAI-compatible API key source (OpenBao path) before wiring up the LLM app
- [ ] Draft the PR for the 11 confirmed-in-scope plugins (9 TEST panels minus Sierra Plot, + Advisor + LLM). Simplest
      mechanism: a single `GF_INSTALL_PLUGINS` env var on the Grafana deployment container (`grafana.instance.yaml`)
      listing all plugin IDs — this works uniformly for panel and app plugins alike and avoids the two-mechanism split
      noted above; per-`GrafanaDashboard.spec.plugins` is only needed if a specific dashboard's JSON declares a plugin
      dependency, which doesn't apply here since these are being evaluated standalone. Advisor additionally needs the
      `grafanaAdvisor` feature toggle.
- [ ] Grafana Assistant: separate follow-up once the user has created and connected a Grafana Cloud stack — not part of
      this PR.
