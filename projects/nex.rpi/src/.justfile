[private]
@default:
    just --choose

# -- Kubernetes related tasks
[doc("Bootstrap all required resources on nex·rpi Raspberry Pi to work properly")]
kubernetes_bootstrap environment="production":
    kubectl create -k 'clusters/{{environment}}/bootstrap' || true

[doc("Shows the diff of the Kubernetes manifests on nex·rpi Raspberry Pi")]
kubernetes_diff environment="production":
    KUBECTL_APPLYSET=true kubectl diff --kustomize 'clusters/{{environment}}' --prune --server-side | delta --side-by-side \
    || true
alias diff := kubernetes_diff

[doc("Applies the Kubernetes manifests on nex·rpi Raspberry Pi")]
kubernetes_apply environment="production":
    KUBECTL_APPLYSET=true kubectl apply --kustomize 'clusters/{{environment}}' --prune --server-side --applyset=clusterapplysets.kubernetes.chezmoi.sh/nex.rpi --force-conflicts
alias apply := kubernetes_apply

