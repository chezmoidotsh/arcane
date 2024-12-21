# mod crossplane 'src/infrastructure/.justfile'
# mod kubernetes 'src/.justfile'

# -- Variables -----------------------------------------------------------------
kubernetes_host := "kubernetes.maison.chezmoi.sh"

[private]
@default:
  just --list --list-submodules


# -- Documentation related tasks -----------------------------------------------
[doc("Generates the architecture diagram for nex·rpi")]
[group("documentation")]
generate_diagram:
  d2 --layout elk --sketch architecture.d2 "assets/architecture.svg"
