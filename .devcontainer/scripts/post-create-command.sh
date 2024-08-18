#!/bin/env bash
# Copyright (C) 2024 vscode (you@you.you)
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

# NOTE: build/load the nix environment before running this script
nix develop --build
direnv allow && eval "$(direnv export bash)"

source /usr/local/share/atlas-utils.lib.sh

cat <<'EOF' | gum style --border rounded --padding "1 2" --foreground '#3498DB' --border-foreground '#3498DB'
   db    88888 8       db    .d88b.            888b.             w      888             w        8 8
  dPYb     8   8      dPYb   YPwww.            8  .8 .d8b. d88b w8ww     8  8d8b. d88b w8ww .d88 8 8
 dPwwYb    8   8     dPwwYb      d8    wwww    8wwP' 8' .8 `Yb.  8       8  8P Y8 `Yb.  8   8  8 8 8
dP    Yb   8   8888 dP    Yb `Y88P'            8     `Y8P' Y88P  Y8P    888 8   8 Y88P  Y8P `Y88 8 8
EOF
echo

run_command "Synchronizing git submodules" -- git submodule update --init --recursive
run_command "Logout to Docker (avoid crashing issues)" -- docker logout

# Run commands freshly installed
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
