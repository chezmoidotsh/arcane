# trunk-ignore-all(shellcheck/SC2312)

# copy_to_volume
# ===========
#
# Summary: Copy a file from the host to a scpecific path a volume.
#
# Usage: copy_to_volume <volume> [--owner <UID>:<GID>] [--mode <MODE>] <files...>
#
# Options:
#   <volume>  The volume to copy the file to
#   <files>   The files to copy to the volume
#   --owner   The owner of the file in the volume
#   --mode    The mode of the file in the volume
#
# Globals:
#   output
#   status
# Returns:
#   0 - files copied to volume
#   1 - otherwise
copy_to_volume() {
	local -r volume="${1}"
	shift

	local owner=""
	local mode=""
	while [[ $# -gt 0 && ${1} =~ ^--.* ]]; do
		case "${1}" in
		--owner)
			[[ $# -lt 2 ]] &&
				batslib_print_kv_single 0 'arguments' "${args[*]}" |
				batslib_decorate "owner is required" |
					(fail || exit 2)

			owner="${2}"
			shift 2
			;;
		--mode)
			[[ $# -lt 2 ]] &&
				batslib_print_kv_single 0 'arguments' "${args[*]}" |
				batslib_decorate "mode is required" |
					(fail || exit 2)

			mode="${2}"
			shift 2
			;;
		*)
			break
			;;
		esac
	done

	run bash -c "LC_ALL=C tr -dc 'a-z' </dev/urandom | head -c 16"
	assert_success
	local -r __container_name="bats.copy_to_volume-${output}"

	run docker run --detach --rm --name "${__container_name}" --volume "${volume}:/dist" alpine tail -f /dev/null
	assert_success
	if [[ -z ${BATS_DOCKER_CONTAINER_IDS[*]} ]]; then
		export BATS_DOCKER_CONTAINER_IDS=("${__container_name}")
	else
		BATS_DOCKER_CONTAINER_IDS+=("${__container_name}")
	fi

	for file in "$@"; do
		run docker cp --archive "${file}" "${__container_name}:/dist"
		assert_success

		if [[ -n ${owner} ]]; then
			run docker exec "${__container_name}" chown -c "${owner}" "/dist/$(basename "${file}")"
			assert_success
		fi
		if [[ -n ${mode} ]]; then
			run docker exec "${__container_name}" chmod -c "${mode}" "/dist/$(basename "${file}")"
			assert_success
		fi
	done
}
