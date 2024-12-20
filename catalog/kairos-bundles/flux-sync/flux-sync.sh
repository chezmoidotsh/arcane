#!/bin/bash
# trunk-ignore-all(shellcheck/SC2312): don't care of the return value
set -euo pipefail

# Override with the `flux.env.KUBECONFIG` key if necessary
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# -- Parameters
lease_duration="30 minutes"
wait_before_retry="15 seconds"

# -- Functions
info() { echo $'\e[36mINFO\e[0m: ' "$1"; }
warn() { echo $'\e[33mWARN\e[0m:' "$1"; }
error() { echo $'\e[31mERROR\e[0m:' "$1"; }

# -- Main program
total_attempts=$(($(date --date="0 - 1734566400 seconds + ${lease_duration}" +%s) / $(date --date="0 - 1734566400 seconds + ${wait_before_retry}" +%s)))
retry_attempt=1
while [[ ${retry_attempt} -le ${total_attempts} ]]; do
	info "Checking if the cluster is ready"
	if ! timeout 5 kubectl version &>/dev/null; then
		error "Kubernetes cluster is not ready... retrying in 15 seconds"
	else
		# --- Step 01: Check if Flux is already installed and synced
		if kubectl get namespace flux-system &>/dev/null; then
			# NOTE: if this namespace already exists, we assume Flux is already installed by this bundle
			#       with all the necessary resources
			info "Namespace flux-system already exists, skipping..."
			exit 0
		fi

		# --- Step 02: Create Lease to avoid concurrency issues
		if ! kubectl get lease -n default flux-sync &>/dev/null; then
			info "Creating lease for Flux sync to avoid concurrency ($(hostname))"
			cat <<EOF | kubectl create -f -
apiVersion: coordination.k8s.io/v1
kind: Lease
metadata:
  name: flux-sync
  namespace: default
spec:
  holderIdentity: $(hostname)
  leaseDurationSeconds: $(date --date="0 - 1734566400 seconds + ${lease_duration}" +%s)
  renewTime: $(date -u +"%Y-%m-%dT%H:%M:%S.000000Z" --date="now + ${lease_duration}")
EOF

			release_lease() { kubectl delete lease -n default flux-sync; } # trunk-ignore(shellcheck/SC2317): release_lease is used inside trap
			trap release_lease EXIT
		else
			warn "Lease already exists, exiting..."
			exit 0
		fi

		# --- Step 03: Create all resources required to sync FluxCD repository
		source_git_url=$(kairos-agent config get flux.git.url)
		source_git_branch=$(kairos-agent config get flux.git.branch)
		source_git_tag=$(kairos-agent config get flux.git.tag)
		source_git_tag_semver=$(kairos-agent config get flux.git.tag_semver)
		source_git_path=$(kairos-agent config get flux.git.path)

		[[ -z ${source_git_url} ]] && error "Missing required parameter 'flux.git.url'" && exit 1 # trunk-ignore(shellcheck/SC2310)
		[[ -z ${source_git_branch} && -z ${source_git_tag} && -z ${source_git_tag_semver} ]] && source_git_branch="main"
		[[ -n ${source_git_branch} && (-n ${source_git_tag} || -n ${source_git_tag_semver}) ]] && error "Cannot specify both 'flux.git.branch' and either 'flux.git.tag' or 'flux.git.tag-semver'" && exit 1 # trunk-ignore(shellcheck/SC2310)
		[[ -n ${source_git_tag} && -n ${source_git_tag_semver} ]] && error "Cannot specify both 'flux.git.tag' and 'flux.git.tag-semver'" && exit 1                                                          # trunk-ignore(shellcheck/SC2310)

		flux_source_args=("--namespace=flux-system" "--url=${source_git_url}")
		[[ -n ${source_git_branch} ]] && flux_source_args+=("--branch=${source_git_branch}")
		[[ -n ${source_git_tag} ]] && flux_source_args+=("--tag=${source_git_tag}")
		[[ -n ${source_git_tag_semver} ]] && flux_source_args+=("--tag-semver=${source_git_tag_semver}")
		mapfile -t flux_source_extra_args < <(kairos-agent config get flux.source_git_extra_args | sed 's/- //')
		[[ ${#flux_source_extra_args[@]} -gt 0 ]] && flux_source_args+=("${flux_source_extra_args[@]}")

		flux_kustomization_args=("--namespace=flux-system" "--source=GitRepository/main")
		[[ -n ${source_git_path} ]] && flux_kustomization_args+=("--path=${source_git_path}")
		mapfile -t flux_kustomization_extra_args < <(kairos-agent config get flux.kustomization_extra_args | sed 's/- //')
		[[ ${#flux_kustomization_extra_args[@]} -gt 0 ]] && flux_kustomization_args+=("${flux_kustomization_extra_args[@]}")

		info "Installing FluxCD components"
		flux install --namespace=flux-system

		info "Creating GitRepository and Kustomization resources"
		flux create source git main "${flux_source_args[@]}"
		flux create kustomization main "${flux_kustomization_args[@]}"

		info "FluxCD components installed successfully"
		exit 0
	fi

	((retry_attempt = retry_attempt + 1))
	sleep "${wait_before_retry}"
done

error "Failed to sync with Flux, timed out (${lease_duration} minutes)"
exit 4
