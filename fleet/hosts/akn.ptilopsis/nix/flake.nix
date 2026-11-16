{
  description = "ptilopsis.akn — Mac Studio (nix-darwin): observability appliance and AI workloads host";

  # ---------------------------------------------------------------------------
  # Skeleton of the Mac Studio configuration (ADR-022, MIGR-20261115-00 step 1).
  # Headless server basics only: no service yet (they arrive at step 2).
  #
  # Not deployed: the machine is not installed yet. Evaluate with:
  #
  #   nix eval .#darwinConfigurations.ptilopsis.system.drvPath
  #
  # The shared catalog (`arcane` input, path:../../../../catalog/nix) is not
  # wired yet: it only exports NixOS modules. Add it at step 2, together with
  # the first darwin module.
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.nix-darwin.url = "github:nix-darwin/nix-darwin/nix-darwin-26.05";
  inputs.nix-darwin.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { nix-darwin, ... }:
    {
      darwinConfigurations.ptilopsis = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        modules = [ ./configuration.nix ];
      };
    };
}
