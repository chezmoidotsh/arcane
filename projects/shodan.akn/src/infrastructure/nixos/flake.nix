{
  description = "shodan.akn — n8n sandbox (n8n-sandbox service, Docker-in-Docker runner) on a Raspberry Pi 5";

  inputs = {
    # Provides the Pi 5 kernel, firmware and bootloader; it pins its own nixpkgs, do not override it with `follows`.
    nixos-raspberrypi.url = "github:nvmd/nixos-raspberrypi/main";
    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixos-raspberrypi/nixpkgs";
    };
  };

  outputs = { nixos-raspberrypi, sops-nix, ... }@inputs: {
    # Build the SD/NVMe image with `nix build .#nixosConfigurations.shodan-sandbox.config.system.build.sdImage`.
    nixosConfigurations.shodan-sandbox = nixos-raspberrypi.lib.nixosSystem {
      specialArgs = inputs;
      modules = [
        ({ nixos-raspberrypi, ... }: {
          imports = with nixos-raspberrypi.nixosModules; [
            raspberry-pi-5.base
            sd-image
          ];
        })
        sops-nix.nixosModules.sops
        ./configuration.nix
        ./modules/sandbox.nix
        ./modules/caddy.nix
      ];
    };
  };
}
