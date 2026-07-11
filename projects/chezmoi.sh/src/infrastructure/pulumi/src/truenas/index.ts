// -----------------------------------------------------------------------------
// TrueNAS configuration (nas.chezmoi.sh)
// -----------------------------------------------------------------------------
// Intentionally not managed:
// - `truenas.Certificate` (ACME-signed certs): the provider can't drive an
//   ACME issuance (no CSR reference, no DNS-01 config) -- only CSR
//   generation is managed (./certificates.ts). Pre-existing certificates
//   also can't be imported: `createType` is immutable and always reads back
//   `CERTIFICATE_CREATE_IMPORTED`, which then requires `certificate`/
//   `privatekey` PEM inputs that can't be supplied without putting real key
//   material in source -- CSRs are created fresh instead of adopted.
// - `truenas.DnsNameserver`: duplicates `network_configuration` (./network.ts).
// - Mail config: configured SMTP (AWS SES) is no longer in use.
// - `truenas.App` / `truenas.Catalog`: only `garage` and `nginx-proxy-manager`
//   are managed (./apps.ts), not every installed app.

import "./alerts";
import "./apps";
import "./certificates";
import "./jobs";
import "./network";
import "./services";
import "./shares";
