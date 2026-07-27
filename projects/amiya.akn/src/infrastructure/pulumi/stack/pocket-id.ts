// Pocket-ID's public-endpoint hardening. Its Vault SSO auth backend, roles, and
// policies live in vault.ts — this file only owns Pocket-ID's own cloud resources.
//
// The Cloudflare rate-limiting Ruleset for auth.chezmoi.sh that used to live here
// moved to rhodes.akn's own stack (stack/pocket-id.ts) as part of the amiya.akn ->
// rhodes.akn migration — imported there via `pulumi import`, removed from this
// stack's state via `pulumi state delete` (2026-07-27), not destroyed. Cloudflare
// only allows one zone-level ruleset per phase, so it can't be declared here too.
export {};
