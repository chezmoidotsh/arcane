{
  description = "oci.chezmoi.sh — Zot OCI registry LXC image (Proxmox)";

  # ---------------------------------------------------------------------------
  # All-in-one flake: binary packaging + NixOS modules + site config.
  #
  # The Zot binary is fetched from the upstream GitHub release and patched for
  # NixOS with autoPatchelfHook — no Go toolchain, no source rebuild.  The
  # NixOS module library (zot, caddy, hardening) lives alongside in ./modules/.
  #
  # Build (produces a Proxmox-importable .tar.xz):
  #
  #   Pure (no TLS at first boot):
  #       nix build
  #
  #   With Cloudflare token baked in (TLS works at first boot):
  #       export CLOUDFLARE_API_TOKEN=…
  #       mise run lxc:build
  # ---------------------------------------------------------------------------

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  inputs.nixos-generators.url = "github:nix-community/nixos-generators";
  inputs.nixos-generators.inputs.nixpkgs.follows = "nixpkgs";

  inputs.arcane-catalog.url = "path:../../../../../../catalog/nix";

  outputs =
    { self, nixpkgs, nixos-generators, arcane-catalog }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # -----------------------------------------------------------------------
      # Zot binary packaging — official upstream release, patched for NixOS.
      #
      # We ship the upstream binary verbatim rather than rebuilding from source:
      #   - Reproducible: pinned by SHA-256, byte-identical to the release.
      #   - Fast: no Go toolchain, no 200+ dep fetch.
      #   - Correct: extensions (search, UI, mgmt) are already baked in.
      #
      # autoPatchelfHook rewrites the ELF interpreter / RPATH to Nix store
      # paths so the binary runs on NixOS without /lib64/ld-linux-x86-64.so.2.
      #
      # Bump: edit `version` + `hash` below, run `mise run nix:hash:update`.
      # Renovate opens PRs automatically (see `.github/renovate.json5`).
      # -----------------------------------------------------------------------
      # renovate: datasource=github-releases depName=project-zot/zot
      version = "v2.1.17";

      zotPackage = pkgs.stdenvNoCC.mkDerivation {
        pname = "zot";
        inherit version;

        src = pkgs.fetchurl {
          url = "https://github.com/project-zot/zot/releases/download/${version}/zot-linux-amd64";
          hash = "sha256-/OLda4e6pk5j0BlhbwWmdE+CfRWiVD3u0SvKbXFtYi0=";
        };

        nativeBuildInputs = [ pkgs.autoPatchelfHook ];
        buildInputs = [ pkgs.glibc ];

        dontUnpack = true;
        dontConfigure = true;
        dontBuild = true;

        installPhase = ''
          runHook preInstall
          install -Dm755 "$src" "$out/bin/zot"
          runHook postInstall
        '';

        meta = with pkgs.lib; {
          description = "OCI-native container registry (upstream release binary)";
          homepage = "https://zotregistry.dev";
          changelog = "https://github.com/project-zot/zot/releases/tag/${version}";
          license = licenses.asl20;
          platforms = [ system ];
          mainProgram = "zot";
          sourceProvenance = [ sourceTypes.binaryNativeCode ];
        };
      };

      cloudflareToken = builtins.getEnv "CLOUDFLARE_API_TOKEN";
    in
    {
      packages.${system}.default = nixos-generators.nixosGenerate {
        inherit system pkgs;
        format = "lxc";
        modules = [
          arcane-catalog.nixosModules.lxcAgent
          ./modules
          ./configuration.nix
          { _module.args = { inherit zotPackage cloudflareToken; }; }
        ];
      };
    };
}
