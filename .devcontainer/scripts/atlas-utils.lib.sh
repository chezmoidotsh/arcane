#!/bin/env bash
# Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ----------------------------------------------------------------------------
# trunk-ignore-all(shellcheck/SC2312)

# run_command - Run a command in a more visually appealing way
function run_command() {
	local temp_dir
	temp_dir="$(mktemp -d)"

	local stdout="${temp_dir}/stdout"
	local stderr="${temp_dir}/stderr"
	local exit_code="${temp_dir}/exit_code"
	# trunk-ignore(shellcheck/SC2064): we want to expand the temp_dir variable now and not when the trap is executed
	trap "rm --recursive --force ${temp_dir}" RETURN

	cat <<EOS >"${temp_dir}/cmdline"
${@:3} 2> ${stderr} 1> ${stdout}; echo \$? > ${exit_code}
EOS

	local title="${1}"
	gum spin --title "${title}" --spinner minidot --spinner.foreground "#F1C40F" -- sh "${temp_dir}/cmdline"

	local exit_code
	exit_code=$(cat "${exit_code}")
	if [[ ${exit_code} -eq 0 ]]; then
		gum style "$(gum style --foreground '#2ECC71' '✓') ${title}"
		if [[ -s ${stdout} ]] || [[ -s ${stderr} ]]; then
			(
				[[ -s ${stdout} ]] && cat "${stdout}"
				[[ -s ${stderr} ]] && cat "${stderr}"
			) | sed 's/^/\|  /g' | gum style --faint --margin "0 0 0 2"
		fi
	else
		gum style "$(gum style --foreground '#E74C3C' '✗') ${title} $(gum style --faint --italic "(exit ${exit_code})" --foreground '#E74C3C')"
		if [[ -s ${stdout} ]] || [[ -s ${stderr} ]]; then
			(
				[[ -s ${stdout} ]] && cat "${stdout}"
				[[ -s ${stderr} ]] && cat "${stderr}"
			) | sed 's/^/\|  /g' | gum style --faint --foreground '#E74C3C' --margin "0 0 0 2"
		fi
	fi
}
