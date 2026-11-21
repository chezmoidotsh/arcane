# `@chezmoi.sh/pulumi-sops-file`

Read and write whole **SOPS-encrypted JSON** files from Pulumi. JSON only: the value types (number, boolean, nested
objects) survive a round trip.

```typescript
import { readSopsFile, SopsFile } from "@chezmoi.sh/pulumi-sops-file";

// Data-source equivalent: decrypted content of an existing file, as a secret Output.
const current = readSopsFile<{ "cloudflare-api-token": string }>("../nix/secrets/o11y.sops.json");

// Resource: the whole file is written from an object (the file may not exist yet).
const file = new SopsFile("o11y-secrets", {
  file: "../nix/secrets/o11y.sops.json",
  content: { "cloudflare-api-token": caddyDns01Token.tokenValue },
});
file.content; // Output<typeof content>, secret
```

- `file` is resolved from the Pulumi program directory; the nearest `.sops.yaml` creation rules (looked up from the
  file's directory) must match its path. Pass `config` (`SopsFile` arg, 2nd argument of `readSopsFile`) to use another
  SOPS config file instead; its `path_regex` are then relative to that config's directory.
- `SopsFile` owns the whole file: keys that are not in `content` are dropped. Merge them yourself with `readSopsFile`.
- `pulumi refresh` re-reads the file: a hand edit or a deleted file shows up as drift and the next `up` rewrites it.
- `readSopsFile` runs when the program runs (previews included) and fails if the file is missing.
- Needs `sops` and the age key where Pulumi runs: a workstation, or a Pulumi Kubernetes Operator image that ships
  `sops`.
- The content is stored in the Pulumi state as a secret.
