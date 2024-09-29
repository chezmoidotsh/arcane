dev_cluster_name := "atlas-dev"

[private]
@default:
    just --list --list-submodules

# -- Kubernetes related tasks
[doc("Bootstrap all required resources on nex·rpi Raspberry Pi to work properly")]
[group('kubernetes')]
bootstrap environment="production":
    kubectl create -k 'clusters/{{environment}}/bootstrap' || true

[doc("Shows the diff of the Kubernetes manifests on nex·rpi Raspberry Pi")]
[group('kubernetes')]
diff environment="production":
    KUBECTL_APPLYSET=true kubectl diff --kustomize 'clusters/{{environment}}' --prune --server-side | delta --side-by-side \
    || true

[doc("Applies the Kubernetes manifests on nex·rpi Raspberry Pi")]
[group('kubernetes')]
apply environment="production":
    KUBECTL_APPLYSET=true kubectl apply --kustomize 'clusters/{{environment}}' --prune --server-side --applyset=clusterapplysets.kubernetes.chezmoi.sh/nex.rpi --force-conflicts

# -- Local development environment
[doc("Start the local development environment")]
[group('development')]
dev: dev_up
    tilt up

[private]
[doc("Create the local development environment")]
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
