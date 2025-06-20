{ self, pkgs, ... }:

let
  # renovate: datasource=github-tags depName=chezmoidotsh/yaldap
  version = "v0.2.0";

  src = pkgs.fetchFromGitHub {
    owner = "chezmoidotsh";
    repo = "yaldap";
    rev = version;
    hash = "sha256-rch6HFdpoFjdBjp/GAY9kSreVKg+ZrPTKBzJImlAPEQ=";
  };
in
rec {
  inherit version;

  # ┌───────────────────────────────────────────────────────────────────────────┐
  # │ <yaldap>: Build yaLDAP from source with Go.                               │
  # └───────────────────────────────────────────────────────────────────────────┘
  yaldap = pkgs.buildGoModule {
    pname = "yaldap";
    inherit version;

    nativeBuildInputs = [ pkgs.musl pkgs.go ];

    inherit src;
    vendorHash = "sha256-tMzwCO2x6wlEwjXcS6Vy1OGzhaCrmiV9UrJdK5JAcEA=";
    subPackages = [ "cmd/yaldap" ];

    CGO_ENABLED = 0;
    ldflags = [
      "-s"
      "-w"
      "-X github.com/prometheus/common/version.Version=${version}"
      "-X github.com/prometheus/common/version.Revision=${src.rev}"
      "-X github.com/prometheus/common/version.Branch=stable"
      "-X github.com/prometheus/common/version.BuildUser=nix"
      "-X github.com/prometheus/common/version.BuildDate=${builtins.substring 0 8 self.lastModifiedDate}"
    ];

    doCheck = false;

    meta = with pkgs.lib; {
      description = "yaLDAP is an easy-to-use LDAP server using YAML file as directory definition.";
      homepage = "https://github.com/chezmoidotsh/yaldap";
      license = licenses.agpl3Only;
      # maintainers = with pkgs.maintainers; [ xunleii ]; # Not currently a maintainer.
      maintainers = [
        {
          name = "Alexandre Nicolaie";
          email = "xunleii@users.noreply.github.com";
          github = "xunleii";
          githubId = 19666897;
          keys = [ "0E1D 33C2 341C 0574 2149  13D4 E8DC 4905 AFAE BC64" ];
        }
      ];
    };
  };
}
