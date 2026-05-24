/*
 * Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */

/**
 * List of allowed commit type, based on the Gitmoji convention.
 *
 * @see {@link https://gitmoji.dev/}
 */
const types = [
	{
		value: ":adhesive_bandage:",
		emoji: "🩹",
		name: ":adhesive_bandage:          🩹  Simple fix for a non-critical issue.",
	},
	{
		value: ":alembic:",
		emoji: "⚗️",
		name: ":alembic:                   ⚗️  Perform experiments.",
	},
	{
		value: ":alien:",
		emoji: "👽️",
		name: ":alien:                     👽️ Update code due to external API changes.",
	},
	{
		value: ":ambulance:",
		emoji: "🚑️",
		name: ":ambulance:                 🚑️ Critical hotfix.",
	},
	{
		value: ":arrow_down:",
		emoji: "⬇️",
		name: ":arrow_down:                ⬇️  Downgrade dependencies.",
	},
	{
		value: ":arrow_up:",
		emoji: "⬆️",
		name: ":arrow_up:                  ⬆️  Upgrade dependencies.",
	},
	{
		value: ":art:",
		emoji: "🎨",
		name: ":art:                       🎨  Improve structure / format of the code.",
	},
	{
		value: ":bento:",
		emoji: "🍱",
		name: ":bento:                     🍱  Add or update assets.",
	},
	{
		value: ":bookmark:",
		emoji: "🔖",
		name: ":bookmark:                  🔖  Release / Version tags.",
	},
	{
		value: ":boom:",
		emoji: "💥",
		name: ":boom:                      💥  Introduce breaking changes.",
	},
	{
		value: ":bricks:",
		emoji: "🧱",
		name: ":bricks:                    🧱  Infrastructure related changes.",
	},
	{
		value: ":bug:",
		emoji: "🐛",
		name: ":bug:                       🐛  Fix a bug.",
	},
	{
		value: ":building_construction:",
		emoji: "🏗️",
		name: ":building_construction:     🏗️  Make architectural changes.",
	},
	{
		value: ":bulb:",
		emoji: "💡",
		name: ":bulb:                      💡  Add or update comments in source code.",
	},
	{
		value: ":closed_lock_with_key:",
		emoji: "🔐",
		name: ":closed_lock_with_key:      🔐  Add or update secrets.",
	},
	{
		value: ":coffin:",
		emoji: "⚰️",
		name: ":coffin:                    ⚰️  Remove dead code.",
	},
	{
		value: ":construction_worker:",
		emoji: "👷",
		name: ":construction_worker:       👷  Add or update CI build system.",
	},
	{
		value: ":fire:",
		emoji: "🔥",
		name: ":fire:                      🔥  Remove code or files.",
	},
	{
		value: ":green_heart:",
		emoji: "💚",
		name: ":green_heart:               💚  Fix CI Build.",
	},
	{
		value: ":hammer:",
		emoji: "🔨",
		name: ":hammer:                    🔨  Add or update development scripts.",
	},
	{
		value: ":heavy_minus_sign:",
		emoji: "➖",
		name: ":heavy_minus_sign:          ➖  Remove a dependency.",
	},
	{
		value: ":heavy_plus_sign:",
		emoji: "➕",
		name: ":heavy_plus_sign:           ➕  Add a dependency.",
	},
	{
		value: ":label:",
		emoji: "🏷️",
		name: ":label:                     🏷️  Add or update types.",
	},
	{
		value: ":lipstick:",
		emoji: "💄",
		name: ":lipstick:                  💄  Add or update the UI and style files.",
	},
	{
		value: ":lock:",
		emoji: "🔒️",
		name: ":lock:                      🔒️ Fix security or privacy issues.",
	},
	{
		value: ":memo:",
		emoji: "📝",
		name: ":memo:                      📝  Add or update documentation.",
	},
	{
		value: ":package:",
		emoji: "📦️",
		name: ":package:                   📦️ Add or update compiled files or packages.",
	},
	{
		value: ":page_facing_up:",
		emoji: "📄",
		name: ":page_facing_up:            📄  Add or update license.",
	},
	{
		value: ":passport_control:",
		emoji: "🛂",
		name: ":passport_control:          🛂  Work on code related to authorization roles and permissions.",
	},
	{
		value: ":pencil2:",
		emoji: "✏️",
		name: ":pencil2:                   ✏️  Fix typos.",
	},
	{
		value: ":pushpin:",
		emoji: "📌",
		name: ":pushpin:                   📌  Pin dependencies to specific versions.",
	},
	{
		value: ":recycle:",
		emoji: "♻️",
		name: ":recycle:                   ♻️  Refactor code.",
	},
	{
		value: ":rewind:",
		emoji: "⏪️",
		name: ":rewind:                    ⏪️ Revert changes.",
	},
	{
		value: ":rocket:",
		emoji: "🚀",
		name: ":rocket:                    🚀  Deploy stuff.",
	},
	{
		value: ":rotating_light:",
		emoji: "🚨",
		name: ":rotating_light:            🚨  Fix compiler / linter warnings.",
	},
	{
		value: ":safety_vest:",
		emoji: "🦺",
		name: ":safety_vest:               🦺  Add or update code related to validation.",
	},
	{
		value: ":see_no_evil:",
		emoji: "🙈",
		name: ":see_no_evil:               🙈  Add or update a .gitignore file.",
	},
	{
		value: ":sparkles:",
		emoji: "✨",
		name: ":sparkles:                  ✨  Introduce new features.",
	},
	{
		value: ":stethoscope:",
		emoji: "🩺",
		name: ":stethoscope:               🩺  Add or update healthcheck.",
	},
	{
		value: ":tada:",
		emoji: "🎉",
		name: ":tada:                      🎉  Begin a project.",
	},
	{
		value: ":technologist:",
		emoji: "💻",
		name: ":technologist:              💻  Improve developer experience.",
	},
	{
		value: ":test_tube:",
		emoji: "🧪",
		name: ":test_tube:                 🧪  Add a failing test.",
	},
	{
		value: ":truck:",
		emoji: "🚚",
		name: ":truck:                     🚚  Move or rename resources (e.g.: files paths routes).",
	},
	{
		value: ":twisted_rightwards_arrows:",
		emoji: "🔀",
		name: ":twisted_rightwards_arrows: 🔀  Merge branches.",
	},
	{
		value: ":wastebasket:",
		emoji: "🗑️",
		name: ":wastebasket:               🗑️  Deprecate code that needs to be cleaned up.",
	},
	{
		value: ":white_check_mark:",
		emoji: "✅",
		name: ":white_check_mark:          ✅  Add update or pass tests.",
	},
	{
		value: ":wrench:",
		emoji: "🔧",
		name: ":wrench:                    🔧  Add or update configuration files.",
	},
	{
		value: ":zap:",
		emoji: "⚡️",
		name: ":zap:                       ⚡️ Improve performance.",
	},
];

/**
 * List of allowed commit scopes.
 */
const scopes = [
	{
		name: "catalog:ansible       - Anything related to the Ansible role catalog",
		value: "catalog:ansible",
	},
	{
		name: "catalog:crossplane    - Anything related to the Crossplane resource catalog",
		value: "catalog:crossplane",
	},
	{
		name: "catalog:flakes        - Anything related to the Nix flakes catalog",
		value: "catalog:flakes",
	},
	{
		name: "catalog:kustomize     - Anything related to the Kustomize component catalog",
		value: "catalog:kustomize",
	},
	{
		name: "catalog:kairos-bundle - Anything related to the Kairos bundle catalog",
		value: "catalog:kairos-bundle",
	},
	{
		name: "catalog:talos         - Anything related to the Talos manifests catalog",
		value: "catalog:talos",
	},
	{
		name: "project:amiya.akn     - Anything related to the amiya.akn project",
		value: "project:amiya.akn",
	},
	{
		name: "project:chezmoi.sh    - Anything related to things not related to a specific project",
		value: "project:chezmoi.sh",
	},
	{
		name: "project:hass          - Anything related to the Home Assistant project",
		value: "project:hass",
	},
	{
		name: "project:kazimierz.akn - Anything related to the kazimierz.akn project",
		value: "project:kazimierz.akn",
	},
	{
		name: "project:lungmen.akn   - Anything related to the lungmen.akn project",
		value: "project:lungmen.akn",
	},
	{
		name: "project:shodan.akn    - Anything related to the shodan project",
		value: "project:shodan.akn",
	},
	{
		name: "deps                  - Dependency updates (automated or manual)",
		value: "deps",
	},
	{
		name: "gh                    - Anything else",
		value: "gh",
	},
];

/** @type {import('cz-git').UserConfig} */
module.exports = {
	rules: {
		"body-full-stop": [0, "always", "."],
		"body-leading-blank": [0, "always"],
		"body-empty": [0, "always"],
		"body-max-length": [2, "always", "Infinity"],
		"body-max-line-length": [2, "always", 80],
		"body-min-length": [2, "always", 0],
		"body-case": [2, "always", "sentence-case"],
		"footer-leading-blank": [2, "always"],
		"footer-empty": [2, "always"],
		"footer-max-length": [2, "always", "Infinity"],
		"footer-max-line-length": [2, "always", 80],
		"footer-min-length": [2, "always", 0],
		"header-case": [2, "always", "sentence-case"],
		"header-full-stop": [2, "never", "."],
		"header-max-length": [2, "always", 100],
		"header-min-length": [2, "always", 0],
		"header-trim": [2, "always"],
		"references-empty": [0, "never"],
		"scope-enum": [2, "always", scopes.map((scope) => scope.value)],
		"scope-case": [2, "always", "lower-case"],
		"scope-empty": [2, "never"],
		"scope-max-length": [2, "always", "Infinity"],
		"scope-min-length": [2, "always", 0],
		"subject-case": [2, "always", "sentence-case"],
		"subject-empty": [2, "never"],
		"subject-full-stop": [2, "never", "."],
		"subject-max-length": [2, "always", 100],
		"subject-min-length": [2, "always", 0],
		"subject-exclamation-mark": [0, "never"],
		"type-enum": [2, "always", types.map((type) => type.value)],
		"type-case": [2, "always", "lower-case"],
		"type-empty": [2, "never"],
		"type-max-length": [2, "always", "Infinity"],
		"type-min-length": [2, "always", 0],
		"signed-off-by": [0, "always", "Signed-off-by: "],
	},
	parserPreset: {
		parserOpts: {
			headerPattern:
				"^(?<type>.+?)\\s?\\((?<scope>.+?)\\)!?\\:\\s(?<subject>(?:(?!#).)*(?:(?!\\s).))(?:\\s\\(?(?<references>#\\d*)\\)?)?$",
			breakingHeaderPattern:
				"^(?<type>.+?)\\s?\\((?<scope>.+?)\\)!\\:\\s(?<subject>(?:(?!#).)*(?:(?!\\s).))(?:\\s\\(?(?<references>#\\d*)\\)?)?$",
			headerCorrespondence: ["type", "scope", "subject", "references"],
		},
	},
	prompt: {
		allowBreakingChanges: [
			":boom:",
			":fire:",
			":coffin:",
			":building_construction:",
			":alien:",
		],
		allowCustomScopes: false,
		allowEmptyScopes: false,
		enableMultipleScopes: true,
		scopes: scopes,
		scopeEnumSeparator: ",",
		types: types,
		typesSearchValue: false,
		skipQuestions: ["body", "footerPrefix", "footer"],
		upperCaseSubject: true,
		useCommitSignGPG: true,
		useEmoji: false,
	},
};
