#!/usr/bin/env bash
# Drop the temporary `import: "<id>"` options written by _migrate.sh, once
# `pulumi up` has imported the resources. clientId lines are kept on purpose.
# Usage: _finish.sh <project>
set -euo pipefail

project="${1:?usage: $0 <project>}"
repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}/projects/${project}/src/infrastructure/pulumi"

cleaned="$(mktemp)"
grep -rlE 'import: "[0-9a-f-]+"' stack --include='*.ts' | while read -r file; do
	echo "${file}" >>"${cleaned}"
	perl -0pi -e 's/\n\t\{ import: "[0-9a-f-]+" \},//g; s/, \{ import: "[0-9a-f-]+" \}\);/);/g' "${file}"
	echo "cleaned ${file}"
done
[[ -s ${cleaned} ]] && xargs rtunk fmt --no-progress <"${cleaned}" >/dev/null 2>&1 || true
rm -f "${cleaned}"
