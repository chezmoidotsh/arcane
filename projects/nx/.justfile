mod crossplane 'src/infrastructure/.justfile'
mod kubernetes 'src/.justfile'

# -- Variables -----------------------------------------------------------------
kubernetes_host := "kubernetes.nx.chezmoi.sh"
dev_cluster_name := "nex-rpi"

[private]
@default:
  just --list --list-submodules


# -- Documentation related tasks -----------------------------------------------
[doc("Generates the architecture diagram for nex·rpi")]
[group("documentation")]
generate_diagram:
  d2 --layout elk --sketch architecture.d2 "assets/architecture.svg"


# -- Development environment related tasks -------------------------------------
[doc("Start the local development environment")]
[group('development')]
dev: dev_up
    tilt up

[doc("Create the local development environment")]
[group('development')]
@dev_up:
    just {{ if env("DEVCONTAINER_NETWORK", "") != "" { "dev_k8s_in_devcontainer" } else { "dev_k8s_local" } }}

[private]
[doc("Create a local Kubernetes cluster accessible from the host")]
dev_k8s_local:
    k3d cluster create --no-lb {{dev_cluster_name}} || true

[private]
[doc("Create a local Kubernetes cluster accessible from the devcontainer")]
dev_k8s_in_devcontainer:
    k3d cluster create --no-lb --network {{ env("DEVCONTAINER_NETWORK") }} {{dev_cluster_name}} || true
    @kubectl config set-cluster k3d-{{dev_cluster_name}} --server=https://k3d-{{dev_cluster_name}}-server-0:6443

[doc("Delete the local Kubernetes cluster")]
[group('development')]
dev_teardown:
    k3d cluster delete {{dev_cluster_name}} || true


# -- Maintenance related tasks -------------------------------------------------
[doc("Enables maintenance mode on the nex·rpi Raspberry Pi")]
[group("maintenance")]
maintenance_enable:
  ssh pi@{{ kubernetes_host }} -- 'sudo overlayroot-chroot systemctl disable --now k3s'
  ssh pi@{{ kubernetes_host }} -- 'sudo raspi-config nonint do_overlayfs 1'
  ssh pi@{{ kubernetes_host }} -- 'sudo reboot'

[doc("Disables maintenance mode on the nex·rpi Raspberry Pi")]
[group("maintenance")]
maintenance_disable:
  ssh pi@{{ kubernetes_host }} -- 'sudo systemctl enable k3s'
  ssh pi@{{ kubernetes_host }} -- 'sudo raspi-config nonint do_overlayfs 0'
  ssh pi@{{ kubernetes_host }} -- 'sudo reboot'
