bats_require_minimum_version 1.11.0
bats_load_library bats-assert
bats_load_library bats-docker
bats_load_library bats-file
bats_load_library bats-support

# setup_suite
# ===========
setup_suite() {
	export BATS_DOCKER_IMAGES=()
	export BATS_DOCKER_CONTAINER_IDS=()
	export BATS_DOCKER_VOLUMES=()
	build_image_with_nix
}

# suite_teardown
# ===========
teardown_suite() {
	run docker image rm --force "${BATS_DOCKER_IMAGES[@]}"
	if [[ ${#BATS_DOCKER_CONTAINER_IDS[@]} -gt 0 ]]; then
		run docker container rm --force "${BATS_DOCKER_CONTAINER_IDS[@]}"
	fi
	if [[ ${#BATS_DOCKER_VOLUMES[@]} -gt 0 ]]; then
		run docker volume rm "${BATS_DOCKER_VOLUMES[@]}"
	fi
}
