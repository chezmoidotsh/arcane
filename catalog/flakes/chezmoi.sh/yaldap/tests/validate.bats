bats_require_minimum_version 1.11.0
bats_load_library bats-support
bats_load_library bats-assert
bats_load_library bats-docker

@test "yaldap image runs properly with default configuration." {
    # NOTE: because this script can be launched inside a dev container, we can't bind a local volume to the container
    #       directly, so we need to copy the configuration file to the container before running it.
    local -r __volume_name="yaldap.config-$(C_ALL=C tr -dc 'a-z' </dev/urandom | head -c 16)"
    run docker volume create "${__volume_name}"
    assert_success
    BATS_DOCKER_VOLUMES+=("${__volume_name}")

    copy_to_volume "${__volume_name}" --owner 23169:42291 --mode 640 "${BATS_TEST_DIRNAME}/basic.configuration.yaml"

    container_setup --volume "${__volume_name}:/etc/yaldap.conf:ro" --publish 10389:389 ${BATS_DOCKER_IMAGE_NAME} -- run --backend.name yaml --backend.url file:///etc/yaldap.conf --log.level debug
    assert_success

    # container_run ${BATS_DOCKER_IMAGE_NAME} healthcheck --ping
    # assert_success
    # assert_output "OK: http://:8080/ping"
}