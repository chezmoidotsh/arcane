---
name: host-readme
description: >
  Writes or reworks the presentation README of a host or project directory (`fleet/hosts/<name>/`, `fleet/clusters/`,
  `projects/<name>/`): the Arknights chibi header, badges, lore callout, then role, access, configuration, deployment
  and contribution. Use it whenever a host or project README is created, rewritten or aligned on the others, when
  someone asks for "the README with the chibi", "the presentation page of <host>", or to build the chibi animation from
  the Arknights wiki with ffmpeg. The model README is `fleet/hosts/akn.ptilopsis/README.md`.
compatibility: Requires mise (ffmpeg, prettier through `mise x`) and network access to arknights.wiki.gg
---

# Host and project README

Every host and project directory has a README that is its **front door**: the first thing someone sees when they browse
the directory on GitHub. It is also the model the other directories copy, so the form matters as much as the content.

It exists to answer one question: _what is this, and how do I work on it?_ It is not a guide, a procedure or an ADR: it
links to them (`documentation-writer` skill for those). `docs/` stays the place for explanations, decisions and
procedures; the README says what is true of this directory now and where to go next.

Model to copy: `fleet/hosts/akn.ptilopsis/README.md`. Read it before writing.

## Rules

- **Language**: French. The code, commits and agent files stay in English.
- **Present tense, target state.** Describe what the host is and does, not how it got there. No history, no "formerly",
  no "replaces the old container", no mention of the migration that created it: the ADR and the migration page carry
  that, and the README links to them at the end.
- **No state.** No "work in progress" badge, no "not deployed yet" callout. They go stale and say nothing about the
  host.
- **Prose first.** A continuous document, not a list of answers. Use a table or a list only for things that are really
  enumerable (steps, checks). Avoid the "Un… Il… Il…" pattern: vary sentences, join related facts.
- **Few sub-headings.** A sub-heading for a one-sentence section is noise. Only the services and the deployment section
  earn `###`.
- **Name what matters, not the tooling.** List the services people use (VictoriaMetrics, Alertmanager), not every
  component behind them. Say how to reach them.
- **Leave out incidental details**: VLAN numbers, disk sizes, anything that changes without changing what the host is.
  Link to the reference page instead of copying a CIDR or a version.
- **One fact in one place.** Do not duplicate what an ADR or reference says: link it.
- **Say what you did not verify.** Commands that never ran on the real machine are written as such in the PR, not
  hidden.

## Structure

1. **Header** (below): logo, title, subtitle, badges, table of contents, lore callout.
2. **Rôle**: what the host is for and why it exists, in a short paragraph, with the ADR link.
3. **Services**: the services that run on it, one block per service, logo and text alternating left and right (see
   [Services](#services)).
4. **Architecture**: the D2 diagram of how these services talk to each other and to the outside, in the blueprint style
   (see [Architecture diagram](#architecture-diagram)), with one or two sentences on how to read it.
5. **Fonctionnement** (named after what it explains: _Le chemin des signaux_, _Le chemin des requêtes_…): only when the
   services have an internal flow worth explaining, such as the observability pipeline (receive, convert, route, store).
   One to three paragraphs that follow a request or a signal hop by hop and say what each hop transforms, and a Mermaid
   `flowchart LR` when the hops are not visible on the D2 diagram (solid for the main path, dotted for the secondary
   one). Skip it when the diagram already says everything.
6. **Accès**: how to reach what it hosts (URLs, ports, who may connect, how the machine itself is administered).
7. **Configuration**: how it is configured, as prose: which modules, where data lives, server settings, secrets and what
   they are for. End with the `nix/` (or equivalent) tree only if it helps.
8. **Déploiement**, with three sub-headings:
   - _Première installation_: manual, numbered, run once. Never automate it behind a task that hides the failure.
   - _Mises à jour_: the one command (`mise run <task>`) and when it does nothing.
   - _Vérifier un déploiement_: a checklist of commands and their expected result.
9. **Contribuer**: how to test before deploying (evaluate, build), where shared code lives, how to regenerate the
   diagram, lint. Do not repeat `AGENTS.md` (commit format, PR rules).
10. **Pour aller plus loin**: last section, links to the ADR, the migration page, related ADRs, the component READMEs
    and the naming reference, each with a few words on why to read it.

The table of contents lists **the sections of this document only**, never external links. Those belong in _Pour aller
plus loin_.

## Services

The services people use or that other machines talk to, **not the infrastructure** that carries them: VictoriaMetrics,
VictoriaLogs, Alertmanager are services; Caddy, the OTLP gateway, sops-nix, launchd, Cilium or cert-manager are not
(they belong to the diagram, the _Fonctionnement_ section or _Configuration_). On a cluster, these are the applications
of `kubernetes/src/apps/`, not `system/`.

One block per service, the logo alternating **left, right, left…** from the first block:

```html
<img src="../../../docs/assets/icons/apps/victoriametrics.svg" alt="VictoriaMetrics" width="96" align="left" />

### [VictoriaMetrics](https://victoriametrics.com/) Stocke les métriques de toutes les machines et des deux clusters, et
sert les requêtes PromQL de Grafana et de vmalert. _Choisi pour sa compatibilité Prometheus et sa faible empreinte
mémoire._

<br clear="all" />
```

- The heading is `###` with a link to the project's site: the one exception to "few sub-headings", it gives each service
  an anchor.
- Two to four lines in French: what the service does **on this host** (who sends to it, who reads it), not the project's
  marketing line. An optional last italic sentence says why this tool was chosen, only when there is a reason worth
  reading (an ADR, a constraint); otherwise leave it out.
- `<br clear="all" />` after each block, so a short text does not let the next logo float beside it. The block is plain
  HTML/Markdown: no `<div style=…>` wrapper, GitHub strips `style`.
- `width="96"` on every logo, `align="left"` then `align="right"`, alternating.
- Logos come from `docs/assets/icons/<apps|system|platform|hardware>/<name>.svg` (colour). A missing one is added there,
  taken from the project's own repository or press kit (SVG, no raster unless the project has none).
- Order: the service that defines the host first, then by importance, not alphabetically.

## Architecture diagram

The diagram shows the **services** of the host, how they talk to each other, and what they talk to outside the host (the
clients that send or read, the external platforms). It uses the shared **blueprint** style, like
`fleet/clusters/akn.rhodes/architecture.d2`: read that file and the header of `docs/assets/d2/styles.blueprint.d2`
(classes and connection styles) before drawing.

- Source: `<directory>/architecture.d2`, starting with:

  ```d2
  vars: {
    d2-config: {
      layout-engine: elk
      sketch: true
    }
  }

  ...@"../../../docs/assets/d2/styles.blueprint.d2"

  direction: right
  ```

- Icons: `assets/icons` is a symlink to `docs/assets/icons/` (`ln -s ../../../../docs/assets/icons/ assets/icons`), and
  nodes use the **blueprint** variant, `assets/icons/<category>/<name>.blueprint.svg`: the same logo, single colour,
  white (`fill="#fff"`), so it reads on the blue background. Create the variant when it is missing (copy the SVG, drop
  its colours, set `fill="#fff"` on the root).
- Classes: `application` for a service, `application-datastore` for a store, `platform` for an external service,
  `network` for `internet` / `localnet` containers that hold what lives there, the host itself as `project`. Every
  connection gets a class (`connect-app` by default; a classless edge is invisible on the background), a verb label with
  the protocol (`"Push metrics (OTLP/HTTP)"`) and the port as arrowhead (`{target-arrowhead: 4318; class: …}`).
- Infrastructure appears only where a flow goes through it (the reverse proxy everyone enters by). Do not draw every
  daemon.
- No `tooltip:` or `link:`: d2 appends them as footnotes to a PNG.
- Output: `assets/architecture.png`, through a `diagram:generate` task in the directory's `.mise.toml`, PNG because
  GitHub renders repository SVGs too small and sandboxes them (no icons):

  ```toml
  [tasks."diagram:generate"]
  description = "Generate the architecture diagram of <hostname>.akn"
  dir = "{{ config_root }}"
  outputs = ["assets/architecture.png"]
  run = "d2 --scale 0.8 architecture.d2 assets/architecture.png"
  sources = ["architecture.d2"]
  ```

- In the README: `![Architecture de <hostname>.akn](./assets/architecture.png)`, then one or two sentences on what the
  reader should notice (the single write path, what stays inside the host). Regenerate and commit the PNG with every
  change to `architecture.d2`.

## Header

The logo and the lore depend on the family of the directory (`docs/reference/Nommage-des-Machines-Reference.md`):

| Directory              | Named after                    | Logo                                                                                        | Lore callout               |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------- |
| `fleet/hosts/akn.*`    | An Arknights operator or group | Animated logo from a skin of the operator, `assets/logo.webp` ([below](#building-the-logo)) | The operator               |
| `fleet/clusters/akn.*` | An Arknights place or ship     | The emblem of the place from the wiki, `assets/logo.png`                                    | The place                  |
| `fleet/hosts/core.*`   | Its function                   | The logo of the main product it runs (Proxmox, TrueNAS, Omni…), from `docs/assets/icons/`   | None: the name has no lore |

The title keeps the `「 」` quotation marks in every case. For a `core.*` host, skip the callout and go straight from
the table of contents to _Rôle_.

Everything above the first `##` is HTML, because GitHub does not centre Markdown inside a `<div align="center">`. Use
one block per element:

```html
<p align="center">
  <img alt="<Operator>, logo animé" src="./assets/logo.webp" height="150" />
</p>

<h1 align="center">「<hostname>.akn」</h1>

<p align="center"><strong>One line: what the host is, in a few words</strong></p>

<p align="center">
  <img alt="host: Mac Studio M1" src="https://img.shields.io/badge/host-Mac_Studio_M1-000000?logo=apple&logoColor=white" />
  <img alt="os: macOS" src="https://img.shields.io/badge/os-macOS-000000?logo=macos&logoColor=white" />
  <img alt="config: nix-darwin" src="https://img.shields.io/badge/config-nix--darwin-5277C3?logo=nixos&logoColor=white" />
  <img alt="deploy: mise" src="https://img.shields.io/badge/deploy-mise_%2B_darwin--rebuild-orange" />
</p>

<p align="center">
  <a href="#rôle">Rôle</a> · <a href="#accès">Accès</a> · … · <a href="#pour-aller-plus-loin">Pour aller plus loin</a>
</p>
```

- The title is the host name between Japanese quotation marks `「 」`.
- Badges are `label-value` shields: `host`, `os`, `config` (nix-darwin, Talos, NixOS…), `deploy` (mise, nix, ArgoCD…).
  The logo sits on the left of the label (shields cannot put it on the value). Add `arch` only when it is not obvious
  from `host`. Escape `-` as `--` and `+` as `%2B` in the shields URL.
- Anchors use GitHub's slug of the heading: lower case, accents kept, apostrophes removed (`#le-chemin-des-signaux`).

### Lore callout

Right after the header, a `[!NOTE]` callout of four or five lines, in French, **paraphrased** from the operator's page
on the game wiki (never copy the text), ending with an italic sentence that ties the character to the machine's role,
then the source link:

```markdown
> [!NOTE]\
> **Ptilopsis** (Rhine Lab, médecin) a servi de cobaye à un prototype… _Seul le langage machine apaise ses troubles, un
> bon nom pour la machine qui lit tous les logs du homelab._ ([source](https://arknights.wiki.gg/wiki/Ptilopsis))
```

The backslash after `[!NOTE]` is mandatory: without it Prettier joins the marker with the next line and the callout
breaks (a trailing double space would be stripped). Use it on every callout.

The operator (or the place, for a cluster) is the one the directory is named after
(`docs/reference/Nommage-des-Machines-Reference.md`). For a place, the italic sentence ties the place to the role of the
cluster in the same way.

### Where to find the information

The Arknights wiki: `https://arknights.wiki.gg/wiki/<Operator>` (e.g. `/wiki/Ptilopsis`).

- Lore: the _Basic info_, _Profile_ and _Archive_ sections when present (some operators have only the basic info and the
  project director's recording; paraphrase what is there, do not invent).
- Logo animation: a `.webm` file on the same wiki, e.g. `https://arknights.wiki.gg/images/Ptilopsis_Skin_2.webm`. Open
  the operator's page, pick a skin, and follow the file link; the file name follows `<Operator>_Skin_<n>.webm`. Check
  the animation before converting it.

- Place emblem (clusters): the page of the place on the same wiki (`https://arknights.wiki.gg/wiki/Rhodes_Island`,
  `/wiki/Lungmen`) shows its emblem or faction logo in the infobox. Follow the file link, download the original (PNG
  with a transparent background, or SVG), and store it as `assets/logo.png` (or `.svg`), rendered at `height="150"`.
  Keep it under 1 MB. When the page has no emblem, take the faction logo the place belongs to and say so in the PR. A
  single-colour emblem (white or black on transparent) disappears on one of GitHub's themes: store
  `assets/logo.dark.png` (white) and `assets/logo.light.png` (the inverted, black copy) and use a `<picture>` with a
  `prefers-color-scheme: dark` source, like `fleet/clusters/akn.lungmen/README.md`. The direct file URL is
  `https://arknights.wiki.gg/images/<File>.png`; the wiki rate-limits automated clients (HTTP 429), so wait and retry
  rather than working around it.
- Lore of a place: its page on the wiki (_Overview_, _History_), paraphrased like an operator's.

## Building the logo

The `.webm` is VP9 with an **alpha channel** (transparent background). GitHub does not play a relative `.webm` in a
README, so convert it to an **animated WebP** (supports alpha, is rendered inline). The file goes in
`<directory>/assets/logo.webp`.

1. Download into a throw-away directory (untrusted file) and look at a frame to choose the crop. The source has a lot of
   empty margin:

   ```sh
   mise x ffmpeg -- ffmpeg -c:v libvpx-vp9 -i source.webm -vf "select=eq(n\,30)" -frames:v 1 frame.png
   ```

2. Crop to the character, then convert. `-c:v libvpx-vp9` **before** `-i` is required: the default VP9 decoder drops the
   alpha plane.

   ```sh
   mise x ffmpeg -- ffmpeg -y -c:v libvpx-vp9 -i source.webm \
     -vf "crop=400:420:312:156,fps=15,scale=-1:200:flags=lanczos" \
     -c:v libwebp_anim -q:v 90 -compression_level 6 -loop 0 -pix_fmt yuva420p assets/logo.webp
   ```

   `crop=W:H:X:Y` is specific to the video (the values above fit `Ptilopsis_Skin_2.webm`, 1024x576). Check the result by
   extracting a frame from the _source_ with the same crop: ffmpeg cannot decode animated WebP.

3. Quality and size: the file is rendered at `height="150"` and stored at 200 px for sharpness. `-q:v 90` keeps the
   edges clean (`-q:v 55` visibly degraded them); `fps=15` and the crop keep it around 650 KB. Stay **under 1 MB**:
   below that, no Git LFS (it would break clones without LFS and the wiki mirror).

## Writing and checking

- Check every statement against the code (`nix/`, `.mise.toml`, the modules it imports). A README that says something
  the code does not do is worse than none.
- Tasks mentioned in the README must exist in the directory's `.mise.toml`. A task that touches the machine uses
  `confirm`, and `skip_if` to stay quiet where it cannot apply (wrong OS, not installed yet).
- Run `mise run lint:fix` (Prettier wraps at 120 columns and may rewrite tables and callouts), then check the callouts
  still start with `[!NOTE]\`.
- Mermaid diagrams render on GitHub; keep labels to names and ports.
- Check the diagram against the code like the text: every edge is a flow that exists (a port that listens, a client
  configured to send). Open the PNG after `mise run diagram:generate`.
- Open a plan annotation (`plannotator annotate <README>`) when the owner wants to review the text line by line.

## Mistakes already made

- A state badge and a "skeleton, not deployed" callout: removed, they carry no information about the host.
- Describing the host by its disk size, VLAN or past (the old container it replaces).
- Questions as headings ("Comment je déploie ?"): the README reads like a FAQ. Write a document.
- One sub-heading per sentence.
- Linking another README that will move or disappear (an old appliance): inline the two lines you need instead.
- Telling the reader there is no SSH while the configuration still enables it: the code is fixed, not the README.
- Listing infrastructure (reverse proxy, gateway, secret tooling) as services: they go in the diagram or the
  configuration.
- All logos on the same side, or a `<div style=…>` wrapper: GitHub strips the style, alternate `align` instead.
