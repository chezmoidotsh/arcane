# Building the logo of a host README

Reference for the `host-readme` skill. The script is `scripts/build-logo`; this page explains what it does and why.

## Where the source comes from

The Arknights wiki: `https://arknights.wiki.gg/wiki/<Operator>` (e.g. `/wiki/Ptilopsis`).

- **Operator (hosts)**: a `.webm` file on the same wiki, e.g. `https://arknights.wiki.gg/images/Ptilopsis_Skin_2.webm`.
  Open the operator's page, pick a skin, and follow the file link; the file name follows `<Operator>_Skin_<n>.webm`.
  Check the animation before converting it.
- **Place (clusters)**: the page of the place (`/wiki/Rhodes_Island`, `/wiki/Lungmen`) shows its emblem or faction logo
  in the infobox. Follow the file link, download the original (PNG with a transparent background, or SVG) and store it
  as `assets/logo.png` (or `.svg`), rendered at `height="150"`. Keep it under 1 MB. When the page has no emblem, take the
  faction logo the place belongs to and say so in the PR.
  - A single-colour emblem (white or black on transparent) disappears on one of GitHub's themes: store
    `assets/logo.dark.png` (white) and `assets/logo.light.png` (the inverted copy) and use a `<picture>` with a
    `prefers-color-scheme: dark` source, like `fleet/clusters/akn.lungmen/README.md`.
  - The direct file URL is `https://arknights.wiki.gg/images/<File>.png`. The wiki rate-limits automated clients
    (HTTP 429): wait and retry rather than working around it.
- **`core.*` hosts**: no Arknights logo, the logo of the main product from `docs/assets/icons/`.

Download into a throw-away directory: the file is untrusted data.

## Why an animated WebP

The `.webm` is VP9 with an **alpha channel** (transparent background). GitHub does not play a relative `.webm` in a
README, so it is converted to an **animated WebP** (supports alpha, rendered inline) stored in
`<directory>/assets/logo.webp`.

## Steps

1. Look at a frame to choose the crop (the source has a lot of empty margin):

   ```sh
   .agents/skills/host-readme/scripts/build-logo frame source.webm 30
   ```

2. Crop to the character and convert. `W:H:X:Y` is specific to the video (`400:420:312:156` fits
   `Ptilopsis_Skin_2.webm`, 1024x576):

   ```sh
   .agents/skills/host-readme/scripts/build-logo convert source.webm fleet/hosts/akn.<name>/assets/logo.webp 400:420:312:156
   ```

   Check the result by extracting a frame from the _source_ with the same crop: ffmpeg cannot decode animated WebP.

3. Size: the file is rendered at `height="150"` and stored at 200 px for sharpness. `-q:v 90` keeps the edges clean
   (`-q:v 55` visibly degraded them); `fps=15` and the crop keep it around 650 KB. The script fails above **1 MB**:
   below that, no Git LFS (it would break clones without LFS and the wiki mirror).
