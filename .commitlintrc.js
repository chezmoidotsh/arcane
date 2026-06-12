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
 * List of allowed commit types, based on the symbol-based convention.
 *
 * Format: type[scope]: Subject
 * Breaking change format: type![scope]: Subject (only +!, ~!, -! are valid)
 *
 * @see docs/decisions/010-replace-gitmoji-with-symbol-commit-types.md
 */
const types = [
	{
		value: "+",
		name: "+    Add    — new feature, service, resource, initial deploy",
	},
	{
		value: "-",
		name: "-    Remove — delete service, file, dead code",
	},
	{
		value: "~",
		name: "~    Improve — perf, config update, behavioral improvement (non-bug)",
	},
	{
		value: "!",
		name: "!    Fix    — repair a bug or broken behavior",
	},
	{
		value: "=",
		name: "=    Refactor — no behavior change (style, tests, DX, CI)",
	},
	{
		value: "^",
		name: "^    Bump   — dependency version upgrade or downgrade",
	},
	{
		value: ">",
		name: ">    Move   — rename or relocate resources",
	},
	{
		value: "<",
		name: "<    Revert — undo a previous commit",
	},
	{
		value: "@",
		name: "@    Docs   — ADRs, README, procedures, comments",
	},
	{
		value: "$",
		name: "$    Security — fix, policy, secret management",
	},
	{
		value: "?",
		name: "?    Experiment — POC, investigation, research",
	},
	{
		value: "*",
		name: "*    Wildcard — does not fit any other type",
	},
	// Breaking change variants — only addition, improvement, and removal can break
	{
		value: "+!",
		name: "+!   Add (breaking) — addition that breaks backward compatibility",
	},
	{
		value: "~!",
		name: "~!   Improve (breaking) — behavioral change that breaks backward compatibility",
	},
	{
		value: "-!",
		name: "-!   Remove (breaking) — removal that breaks backward compatibility",
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
		name: "catalog:nix - Anything related to the Nix* catalogs (nixpkgs, nixos, home-manager, etc.)",
		value: "catalog:nix",
	},
	{
		name: "catalog:talos         - Anything related to the Talos manifests catalog",
		value: "catalog:talos",
	},
	{
		name: "catalog:opa           - Anything related to the OPA policy catalog",
		value: "catalog:opa",
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
		name: "gh                    - GitHub workflows, issue templates, root config files",
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
		// header-case disabled: symbol prefixes (+, ~, !, …) have no case
		"header-case": [0, "always", "sentence-case"],
		"header-full-stop": [2, "never", "."],
		"header-max-length": [2, "always", 100],
		"header-min-length": [2, "always", 0],
		"header-trim": [2, "always"],
		"references-empty": [0, "never"],
		// scope-enum set to warning: multi-scope commits (scope1,scope2) won't match
		// single enum entries; validation is enforced by the cz-git prompt instead
		"scope-enum": [1, "always", scopes.map((scope) => scope.value)],
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
		// type-case disabled: symbol types have no case transformation
		"type-case": [0, "always", "lower-case"],
		"type-empty": [2, "never"],
		"type-max-length": [2, "always", "Infinity"],
		"type-min-length": [2, "always", 0],
		"signed-off-by": [0, "always", "Signed-off-by: "],
	},
	parserPreset: {
		parserOpts: {
			// Format: type[scope]: Subject
			// type  = one or two non-whitespace chars before '['
			// scope = content inside '[' ... ']' (may contain commas for multi-scope)
			headerPattern: /^(?<type>\S+?)\[(?<scope>[^\]]+)\]:\s(?<subject>.+)$/,
			// Breaking change: only +!, ~!, -! are valid breaking types
			breakingHeaderPattern:
				/^(?<type>[+~-]!)\[(?<scope>[^\]]+)\]:\s(?<subject>.+)$/,
			headerCorrespondence: ["type", "scope", "subject"],
		},
	},
	prompt: {
		allowBreakingChanges: ["+!", "~!", "-!"],
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
