# trunk-ignore-all(shellcheck/SC2312)

# container_run
# ===========
#
# Summary: Run a command into a container that shared the network namespace a running container.
#
# Usage: container_run [--container <container_name>] <image> <command> [<args>...]
#
# Options:
#   <container_name>  The name or id of the container to share the network namespace with (default: $BATS_CONTAINER_ID)
#   <image>           The image to run
#   <command>         The command to run
#   <args>            The arguments to pass to the command
#
# Globals:
#   output
#   lines
# Returns:
#   0 - the command ran successfully
#   1 - otherwise
function container_run() {
	local -r args=("$@")
	[[ $# -lt 2 ]] &&
		batslib_print_kv_single 9 'arguments' "${args[*]}" |
		batslib_decorate "at least an image and a command are required" |
			(fail || exit 2)

	local container_id="${BATS_CONTAINER_ID}"
	if [[ ${1} == "--container" ]]; then
		[[ $# -lt 3 ]] &&
			batslib_print_kv_single 9 'arguments' "${args[*]}" |
			batslib_decorate "container name is required" |
				(fail || exit 2)
		container_id="${2}"
		shift 2
	fi

	local image="${1}"
	shift

	run docker run --rm --network "container:${container_id}" "${image}" "$@"
}
