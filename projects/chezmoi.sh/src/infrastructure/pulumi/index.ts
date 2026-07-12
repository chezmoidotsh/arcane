// Renders projects/chezmoi.sh/docs/TRUENAS.md from ./src/truenas's config
// modules -- those modules' exports are imported directly by
// ./src/truenas-docs, so import order here doesn't matter.
import "./src/truenas-docs";
import "./src/backblaze";

import "./src/observability";
import "./src/omni";
// import "./src/truenas";
import "./src/zot-registry";

export * from "./src/truenas";
