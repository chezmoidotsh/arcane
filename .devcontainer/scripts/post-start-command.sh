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

source /usr/local/share/atlas-utils.lib.sh

if command -v nom &>/dev/null; then
	nix develop --build --log-format internal-json -v |& nom --json
else
	nix develop --build
fi

run_command "Configure git hooks" -- lefthook install

# Check if git user and email are set
if [[ -z "$(git config user.name)" ]] && [[ -z "$(git config user.email)" ]] && [[ -z "$(git config --global user.name)" ]] && [[ -z "$(git config --global user.email)" ]]; then
	echo
	cat <<EOF | gum style --border rounded --padding "1 2" --foreground '#E67E22' --border-foreground '#E67E22'
You are missing your git user and email configuration!
Please set your git user and email with the following commands:
  git config --global user.name "Your Name"
  git config --global user.email "Your Email"
EOF
fi
