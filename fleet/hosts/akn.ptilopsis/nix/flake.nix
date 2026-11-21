{
  description = "ptilopsis.akn — Mac Studio (nix-darwin): observability stack host";

  # ---------------------------------------------------------------------------
  # Mac Studio configuration (ADR-022, MIGR-20261115-00 steps 1-2): headless
  # server settings, the observability appliance (launchd daemons from the
  # shared catalog) and the host's own o11y-agent.
  #
  # Not deployed: nothing has been built or activated yet. Evaluate with:
  #
  #   nix eval path:.#darwinConfigurations.ptilopsis.system.drvPath
  #
  # (`path:` so that files not tracked by Git yet are seen.)
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  inputs.nix-darwin.url = "github:nix-darwin/nix-darwin/master";
  inputs.nix-darwin.inputs.nixpkgs.follows = "nixpkgs";

  # Shared catalog: the host agent and the log size cap (darwinModules).
  inputs.arcane.url = "path:../../../../catalog/nix";
  inputs.arcane.inputs.nixpkgs.follows = "nixpkgs";

  # Secrets decrypted on the host at activation (age key derived from the SSH
  # host key), as on the NixOS VPSes.
  inputs.sops-nix.url = "github:Mic92/sops-nix";
  inputs.sops-nix.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { nix-darwin, arcane, sops-nix, ... }:
    {
      darwinConfigurations.ptilopsis = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        modules = [
          sops-nix.darwinModules.sops
          arcane.darwinModules.o11yAgent
          arcane.darwinModules.logTrim
          ./configuration.nix
        ];
      };
    };
}
