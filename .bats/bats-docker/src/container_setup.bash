# trunk-ignore-all(shellcheck/SC2312,shellcheck/SC2034)

# container_setup
# ===========
#
# Summary: Configure and start a Docker container.
# Note: The container is stopped and removed automatically when the test ends or fails
#       thanks to the `container_teardown` function.
#
# Usage: container_setup [--wait <seconds>] [<docker_opts>... --] <image_name> [<container_args>...]
#
# Options:
#   --wait <seconds>  The maximum number of seconds to wait for the container to be healthy (default: no wait)
#   <docker_opts>     Options to pass to `docker run`
#   <image_name>      The image to run
#   <container_args>  The arguments to pass to the container
#
# IO:
#   STDERR - details, on failure
#            error message, on error
#
# Globals:
#   BATS_CONTAINER_ID   The id of the container created
#
# Returns:
#   0 - container running and healthy if --wait is set
#   1 - container running but not healthy if --wait is set
#   2 - otherwise
#
# Status:
#   0 - container running and healthy if --wait is set
#   1 - container running but not healthy if --wait is set
function container_setup() {
	local -r args=("$@")
	[[ $# -lt 1 ]] &&
		batslib_print_kv_single 9 'arguments' "${args[*]}" |
		batslib_decorate "at least an image name is required" |
			(fail || exit 2)

	local wait_seconds=-1
	local docker_opts=()
	while [[ $# -gt 0 && ${1} != "--" ]]; do
		case "${1}" in
		--wait)
			[[ $# -lt 2 ]] &&
				batslib_print_kv_single 0 'arguments' "${args[*]}" |
				batslib_decorate "wait time is required" |
					(fail || exit 2)

			wait_seconds="${2}"
			if ! [[ ${wait_seconds} =~ ^[0-9]+$ ]]; then
				batslib_print_kv_single 12 'arguments' "${args[*]}" 'wait_seconds' "${wait_seconds}" |
					batslib_decorate "wait time must be a positive integer" |
					(fail || exit 2)
			fi

			shift 2
			;;
		*)
			docker_opts+=("${1}")
			shift
			;;
		esac
	done

	[[ ${1} == "--" ]] && shift # skip the --
	if [[ $# -lt 1 ]]; then
		batslib_print_kv_single 12 'arguments' "${args[*]}" 'wait_seconds' "${wait_seconds}" 'docker_opts' "${docker_opts[*]}" |
			batslib_decorate "at least an image name is required" |
			(fail || exit 2)
	fi

	local -r image_name="${1}"
	shift

	run bash -c "LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16"
	local -r __container_name="bats-${output}"
	run docker run --detach --name "${__container_name}" "${docker_opts[@]}" "${image_name}" "${@}"
	assert_success

	run docker inspect --format '{{.Id}}' "${__container_name}"
	assert_success
	export BATS_CONTAINER_ID="${lines[0]}"

	until [[ ${wait_seconds} -le 0 || "$(docker inspect -f '{{.State.Health.Status}}' "${BATS_CONTAINER_ID}")" == "healthy" ]]; do
		sleep 1
		wait_seconds=$((wait_seconds - 1))
	done

	case "${wait_seconds}" in
	-1)
		status=0
		output="container ${__container_name} (${BATS_CONTAINER_ID}) running"
		;;
	0)
		status=1
		output="container ${__container_name} (${BATS_CONTAINER_ID}) is unhealty"
		;;
	*)
		status=0
		output="container ${__container_name} (${BATS_CONTAINER_ID}) running and healty"
		;;
	esac

	# trunk-ignore(shellcheck/SC2317)
	teardown() { container_teardown "${BATS_CONTAINER_ID}"; }
}
