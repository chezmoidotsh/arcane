# TLS front for Pelican: Caddy obtains the certificates (HTTP-01) and proxies
#  - minecraft.chezmoi.sh       -> the Panel (127.0.0.1:81)
#  - main.minecraft.chezmoi.sh  -> Wings (127.0.0.1:8080), called by browsers for
#                                  the console and the file manager.
#
# Authentication is handled by Pelican itself: users sign in with Pocket-Id
# through the community "Pocket ID Provider" plugin (by Ebnater, see
# docs/BOOTSTRAP.md). Which Pocket-Id users may sign in is decided by the
# client's group restriction there.
{ ... }:
{
  services.caddy = {
    enable = true;
    virtualHosts."minecraft.chezmoi.sh".extraConfig = ''
      reverse_proxy 127.0.0.1:81
    '';
    virtualHosts."main.minecraft.chezmoi.sh".extraConfig = ''
      reverse_proxy 127.0.0.1:8080
    '';
  };
}
