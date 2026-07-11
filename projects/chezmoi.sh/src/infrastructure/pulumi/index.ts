// Renders projects/chezmoi.sh/docs/TRUENAS.md from ./src/truenas's config
// modules and ./src/backups -- those modules' exports are imported directly
// by ./src/truenas-docs, so import order here doesn't matter.
import "./src/truenas-docs";

export * from "./src/backups";
export * from "./src/observability";
export * from "./src/omni";
export * from "./src/truenas";
export * from "./src/zot-registry";
