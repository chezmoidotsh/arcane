# TrueNAS Service Accounts

One file per service account (`truenas.User`), each colocated with the `Nfs4AclAssignment` for the dataset that account
owns -- which NFS4 ACL template (`../acls.ts`) a human should apply to it, and with this account as owner. This stack
can't apply that template itself (see `../zpools/README.md`'s "Filesystem ACLs" section for why); the assignment exists
so `../truenas-docs` can turn it into an instruction in the generated documentation. A dataset's assignment lives here,
next to its owner, instead of in `../acls.ts`, whenever that dataset has exactly one dedicated identity -- reading
`home-assistant.ts` tells you everything about that account and what it's meant to own, without cross-referencing a
second file. Datasets with no single owning identity (multiple local accounts need access, not one service account) have
their assignment in `../acls.ts` instead -- see that file's header comment.

## UID numbering

Every account here is a **service account (SA)**: a machine identity backing one specific application, never a human
login. UIDs `30000`-`30999` are reserved for service accounts managed by this stack -- the range itself is the signal
that separates them from personal/human accounts on the NAS (a different range, not managed by Pulumi). Picking a number
in that range and moving on is the whole rule; there's no further sub-structure to it.

> [!WARNING] **Exception: `firesticktv.ts`.** Not a service account backing an application, and it owns no dataset --
> it's a dedicated SMB login for one viewer device (a Fire TV Stick) to reach the media shares. It has no `uid` at all
> (TrueNAS assigns one from its normal range) and no `Nfs4AclAssignment`, since the shares it needs are already open to
> every local SMB account via `NFSV4_SMB_ALL` (`../acls.ts`). Everything else about it (password handling,
> `groupCreate`, `home`/`shell`) still follows the same conventions as every other account below.
>
> **Partial exception: `jellyfin.ts`.** This one _does_ back an application (Jellyfin, in Kubernetes) and so still takes
> a `uid` from the SA range below -- but like `firesticktv.ts`, it owns no dataset and has no `Nfs4AclAssignment`: it
> only needs to read the same already-open media shares over SMB.

## Why every field below is set explicitly

Each account declares the same shape:

- `password`: a `random.RandomPassword` (see below), never a human-chosen value.
- `home: "/var/empty"`, `shell: "/usr/sbin/nologin"`: this is a machine account, not something anyone logs into
  interactively -- an unusable shell and no real home directory make that explicit instead of leaving TrueNAS' defaults
  to imply it.
- `groups: []`, `sudoCommands: []`: no supplementary group membership, no sudo rights. Declaring them as empty arrays
  (rather than leaving them unset) states "this account has none of that, on purpose" -- an empty array and an omitted
  field aren't the same claim.
- `groupCreate: true`: TrueNAS creates a matching primary group per account, so `FilesystemAcl` entries can use
  `user.group` (the resulting gid) without a separate `truenas.Group` resource to maintain.
- `smb: true`: the account authenticates over SMB -- every dataset owned by one of these accounts is reached via an SMB
  share, never NFS (see `../shares.ts` -- NFS here has no per-person identity at all, only a blanket
  `mapallUser`/`mapallGroup`, so a dedicated account wouldn't add anything on that path).

## Password handling

Every account's `truenas.User` is a **child** of its own `random.RandomPassword` (`{ parent: ... }`), not the other way
around: the `password` field consumes the password resource's `.result` as an input, so the password must already exist
as a resource before the account referencing it can be constructed -- that ordering constraint is also what decides
which one can structurally be the other's parent. Grouping them this way keeps a password and the one account it belongs
to together in the resource tree (`pulumi stack`, state explorer), instead of two unrelated top-level resources.

None of these passwords are ever pushed into OpenBao/Vault by this stack (no `vault.*` resource anywhere here, despite
`@pulumi/vault` being available elsewhere in this monorepo). This stack provisions the NAS, which sits below Vault in
the dependency chain -- OpenBao's own storage can live on this NAS. A Vault write from here would make "the NAS exists"
and "Vault is reachable" depend on each other, breaking both normal apply order and disaster recovery (this stack must
be able to apply cleanly with Vault entirely down). Retrieve a generated password after `pulumi up` with:

```sh
pulumi stack output <name>PasswordSecret --show-secrets
```

and copy it to wherever it's consumed (OpenBao, Home Assistant's own backup config, ...) by hand.
