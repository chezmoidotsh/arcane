# trunk-ignore-all(shellcheck/SC2292): https://bats-core.readthedocs.io/en/stable/gotchas.html#or-did-not-fail-my-test

# build_image_with_nix
# ===========
#
# Summary: Build a Docker image using a Nix flake in given directory.
#
# Usage: build_image_with_nix <directory>
#
# Options:
#   <directory>  The directory containing the Nix flake
#
# Globals:
#   BATS_APP_NAME
#   BATS_BATS_DOCKER_IMAGE_NAME
build_image_with_nix() {
	# preflight checks to ensure that the environment is ready
	assert_file_exists "flake.nix"
	run grep -oP '(?<=@sh.chezmoi.app.image: )[^ ]+' flake.nix
	[[ ${status} -ne 0 || -z ${output} ]] && fail 'The `sh.chezmoi.app.image` attribute (comment) is not set in `flake.nix`.' # trunk-ignore(shellcheck/SC2016)
	export BATS_APP_NAME="${output}"

	# build the container image using Nix
	mkdir --parents /nix/tmp
	TMPDIR=/nix/tmp run nix build --print-out-paths
	assert_success

	# load the container image into the Docker daemon and retag it
	# for the test suite
	run docker load <"${lines[-1]}"
	assert_success

	local -r __docker_load_output="${lines[-1]}"
	run grep -oP '(?<=Loaded image: )[^ ]*' <<<"${__docker_load_output}"
	if [[ -z ${output} ]]; then
		run grep -oP '(?<=The image )[^ ]*' <<<"${__docker_load_output}"
	fi
	local -r __docker_image_name="${output}"

	run bash -c "LC_ALL=C tr -dc 'a-z' </dev/urandom | head -c 16"
	assert_success

	local -r __final_docker_image_name="${__docker_image_name%%:*}:bats-${output}"
	run docker tag "${__docker_image_name}" "${__final_docker_image_name}"
	assert_success

	export BATS_DOCKER_IMAGE_NAME="${__final_docker_image_name}"
	export BATS_DOCKER_IMAGES=("${BATS_DOCKER_IMAGE_NAME}")
	return 0
}
