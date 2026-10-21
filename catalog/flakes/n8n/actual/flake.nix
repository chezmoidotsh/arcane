{
  description = "n8n community node n8n-nodes-actual, as an OCI image meant to be mounted as a Kubernetes image volume";

  inputs.nixpkgs.url = "nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs, ... }:
    let
      pname = "n8n-nodes-actual";
      # oripathy: type=npm
      version = "26.10.9";

      # The package vendors a linux-x64 better-sqlite3 binary, so x86_64 is the only supported system.
      systems = [ "x86_64-linux" ];

      mkImage = system:
        let
          pkgs = import nixpkgs { inherit system; };
          src = pkgs.fetchurl {
            url = "https://registry.npmjs.org/${pname}/-/${pname}-${version}.tgz";
            hash = "sha512-n4JIkmo0ObStKTSghCvdWQUiorTRwk6lkWOXf/LXn61ly+PLY+lzdV+HJbcVut2k05NwhCJETOYtYNbmyk7WGw==";
          };

          # The npm tarball is self-contained: dependencies are bundled in dist/nodes/ActualBudget/ActualBudget.node.js,
          # the only entry point declared in package.json. N8N_CUSTOM_EXTENSIONS, however, loads every *.node.js it
          # finds, including the unbundled v1/ and v2/ node versions, which require @actual-app/api (not installed).
          rootfs = pkgs.runCommand "${pname}-${version}" { } ''
            mkdir -p $out
            tar -xzf ${src} --strip-components=1 -C $out
            rm $out/dist/nodes/ActualBudget/v*/*.node.js
          '';
        in
        pkgs.dockerTools.buildImage {
          name = "n8n-nodes/actual";
          tag = version;
          copyToRoot = rootfs;
        };
    in
    {
      packages = nixpkgs.lib.genAttrs systems (system: { default = mkImage system; });
    };
}
