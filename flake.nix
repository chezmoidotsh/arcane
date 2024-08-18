{
  description = "Nix configuration";

  # Nixpkgs / NixOS version to use.
  # inputs.nixpkgs.url = "nixpkgs/nixos-24.11";
  # TODO: nixos-24.11 is not currently available, and required to build some
  #       flake, so we will use this one too too avoid using two different
  #       nixpkgs versions and increasing the space usage.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = import ./shell.nix { inherit pkgs; };
      }
    );
}
