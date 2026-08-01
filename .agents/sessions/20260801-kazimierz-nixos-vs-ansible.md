# kazimierz.akn: NixOS immutable image vs. Ansible — evaluation and decision

## Objective

Part of issue 1077 (itself part of the Crossplane→Pulumi/OCI migration tracked in issue 1010): decide and implement how
kazimierz.akn's OS/service layer (Pangolin + Gerbil + Traefik, no CrowdSec) gets built and deployed on the new OCI
instance, once it exists (`projects/kazimierz.akn/src/infrastructure/pulumi/stack/oci/`).

## Context & reflections

### What was tried: immutable NixOS qcow2 image

Built a full NixOS flake at `projects/kazimierz.akn/src/infrastructure/nixos/` (branch
`feat/issue-1077-kazimierz-nixos`):

- `flake.nix`, `configuration.nix`, `modules/{pangolin,storage,hardening,geoip}.nix`
- Found nixpkgs (nixos-unstable) ships a first-class `services.pangolin` module that wires fosrl-pangolin +
  fosrl-gerbil + Traefik together natively (ACME, dynamic config from Pangolin's own API, no CrowdSec anywhere) — this
  avoided hand-packaging Pangolin/Gerbil from source, which would otherwise have been the bulk of the work.
- Verified real OCI state via the `oci` CLI while writing this: the `chezmoi.sh` compartment already exists (must be
  `pulumi import`ed, not created); `kazimierz.akn` doesn't exist yet (real create). Corrected instance sizing to the
  tenancy's actual Always Free ARM quota (2 OCPU / 12 GB in eu-paris-1), not the commonly-quoted 4 OCPU / 24 GB ceiling,
  which doesn't apply here.
- `scripts/nix:build:qcow2` added as a sibling to `nix:build:lxc` for the Docker-wrapped build.

**This part (the Pulumi OCI infrastructure stack) is unaffected by everything below and stays as-is** — it provisions
the same OCI infra regardless of what ends up running on the instance.

### Where it broke down

1. **Local KVM requirement.** `nixos-generators`' qcow-efi format (via nixpkgs' `make-disk-image.nix`) builds the image
   by unconditionally booting a QEMU VM (`pkgs.vmTools.runInLinuxVM`, hardcoded `requiredSystemFeatures = [ "kvm" ]`) —
   not a performance optimization, a hard Nix-level gate. The dev machine is Apple Silicon: x86_64 KVM is categorically
   impossible there (wrong CPU architecture for hardware virtualization), and aarch64 KVM through Docker Desktop's
   nested virtualization is unreliable/undocumented at best. Confirmed live: `mise run image:build:amd64` failed with
   `Reason: required system or feature not available. Required system: 'x86_64-linux' with features {kvm}`.

2. **Packer considered, rejected.** Packer's `oracle-oci` builder avoids local KVM entirely (it launches a real OCI
   compute instance, provisions over SSH, snapshots it) — genuinely solves the KVM problem. But its "provisioner" model
   means shell/Ansible on a stock Oracle Linux/Ubuntu base, i.e. reverting to the current Ansible+Docker-Compose
   architecture retargeted at OCI. That's most of what's proposed below anyway, just without the NixOS module work in
   between.

3. **nixos-anywhere tried for real, partially worked.** Alternative that keeps NixOS while avoiding local KVM: build the
   system closure normally (no VM needed for that), then kexec-install it onto a real running Linux instance over SSH —
   partitioning happens on the target's own hardware, not in a local sandbox.
   - Real test: created a throwaway Debian cloud-init VM on pve-01 (VMID 9077, scratch IP 10.0.0.200 from the IPAM
     "reserved" block), added `modules/disko.nix` (GPT+ESP+ext4 on `/dev/vda`) and a
     `nixosConfigurations.kazimierz-anywhere-test` flake output.
   - `nixos-anywhere --build-on remote` ran the full kexec → disko → remote build → bootloader install → reboot sequence
     successfully against real x86_64 Proxmox hardware, zero local KVM used. This is the part that actually validates
     the "no local KVM" theory.
   - Confirmed live on that same VM: `/dev/vda` (root) / `/dev/vdb` (scratch data) is the real virtio-blk device naming
     on Proxmox — same naming OCI's paravirtualized attachment uses per Oracle's docs, so `storage.nix`'s `/dev/vdb`
     assumption holds up on at least one of the two targets.
   - Hit a wall: `boot.loader.systemd-boot` needs UEFI. The install ran under legacy BIOS (nixos-anywhere logged
     "skipping EFI variable modifications"), and switching the VM to OVMF+q35 afterward — and even recreating it from
     scratch with OVMF from the start — produced a VM with an actively-running CPU but zero serial console output and no
     network, for over 10 minutes, on a _plain Debian cloud image_ (not even NixOS). Not resolved: no VNC/real console
     access from this environment to see what's actually on screen. Looks like a Proxmox/OVMF-on-this-host quirk rather
     than a disko/nixos-anywhere problem specifically, but that's inference, not confirmed.

### Decision: KISS wins

Weighed against the difficulties actually hit:

- No viable local build path on the Mac dev machine (KVM), and the remote-build alternative (nixos-anywhere) still hit a
  real, unresolved boot issue on the very first real test.
- Every future config change would mean repeating the _entire_ heavy cycle either way: build (Docker+Nix) → push to an
  Object Storage bucket → import as an OCI custom image → garbage-collect the previous image (10 GB/50 GB free-tier cap)
  → recreate the instance — for a single gateway host running three services.
- The reproducibility/no-drift benefit NixOS brings doesn't clearly outweigh that operational cost for this particular
  host, given how much friction showed up just getting _one_ test image to boot.

**Chosen direction: keep Ansible + Docker Compose (the existing role), retarget it at the new OCI instance instead of
Hetzner, and drop only the CrowdSec-specific tasks** (already isolated in `roles/pangolin/tasks/crowdsec.yml` — not
interleaved with the rest of the role). This reuses the large majority of what's already written and proven in
production, instead of re-solving image-building from scratch.

### Auto-update / notification-on-change (raised, not yet decided)

Asked about a pull-based auto-update model (instance polls the repo every N minutes, applies the new config, notifies on
change). This is what `comin` would have provided for the NixOS path — and issue 1077 had already tried and explicitly
rejected exactly that (see the issue's own "Why this changed" section): it needs Nix _and_ a binary cache (Attic)
reachable from the instance, or every pull would compile Pangolin's Next.js frontend from source on a 2 OCPU / 12 GB ARM
box; plus secrets-repopulation-on-tmpfs complexity; plus the risk of a bad pull silently breaking a live service.

The Ansible-shaped equivalent is much lighter: `ansible-pull` on a systemd timer, with a notification step (ntfy/
Slack/Discord webhook) gated on Ansible's own "changed" task count. No Nix, no binary cache, no secrets-on-tmpfs —
reuses the existing role as-is. Not implemented yet, flagged as a possible follow-up once the Ansible-on-OCI base is
working.

## Change history

- Built the NixOS flake (`projects/kazimierz.akn/src/infrastructure/nixos/`), `scripts/nix:build:qcow2`, and the
  `image:push` mise task — commits on `feat/issue-1077-kazimierz-nixos`.
- Switched `flake.nix`'s nixpkgs input from `nixos-26.05` to `nixos-unstable` per request.
- Added `modules/disko.nix` + `nixosConfigurations.kazimierz-anywhere-test` (x86_64-linux) as an experimental,
  not-production-wired output for the nixos-anywhere test — still uncommitted at the time of writing.
- Created and destroyed/recreated Proxmox VM 9077 twice while diagnosing the BIOS/UEFI mismatch; VM currently still
  exists (10.0.0.200), stuck mid-hang after the OVMF switch, pending a decision on whether to inspect (real console/VNC)
  or destroy.

## Attention points

- **VM 9077 on pve-01 (10.0.0.200)** is still running, hung. Needs `qm stop 9077; qm destroy 9077 --purge` once no
  longer needed for inspection.
- **`projects/kazimierz.akn/src/infrastructure/nixos/`** (committed on this branch) is now expected to be abandoned in
  favor of Ansible. Decide: delete, or keep on this branch as reference/in case the calculus changes later (e.g. if the
  OVMF issue turns out to be trivial once someone has real console access).
- **Pulumi stack impact**: `stack/oci/instance.ts`'s `sourceDetails.sourceId` (currently `oci_image_id`, meant for a
  custom NixOS image) needs to instead reference a stock Ubuntu/Oracle Linux image OCID if Ansible is confirmed —
  matching what the Hetzner side already boots (Ubuntu 24.04). Not yet changed.
- **Issue 1077** ("Build immutable NixOS qcow2 images…") no longer matches the chosen direction and needs reworking or
  replacing with an "Ansible on OCI" issue, mirroring how issue 1010 itself was already reworked once (Crossplane →
  Pulumi).

## Next steps

- [ ] Confirm: Ansible + Docker Compose on OCI, CrowdSec tasks dropped, is the final direction
- [ ] Decide fate of VM 9077 (destroy vs. inspect via real console first)
- [ ] Decide fate of the NixOS flake work on this branch (delete vs. keep dormant)
- [ ] Update `stack/oci/instance.ts` to target a stock Ubuntu/OL image instead of a custom NixOS image
- [ ] Retarget the Ansible role's `host_vars` from Hetzner to the OCI instance; stop including `crowdsec.yml`
- [ ] Rework issue 1077 (or open a replacement issue) to reflect the Ansible-on-OCI direction
- [ ] Optional: `ansible-pull` + notification webhook for auto-update, once the base deployment works
