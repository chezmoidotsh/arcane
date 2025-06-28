// Configuration commitlint spécifique pour la validation des titres de PR
// Étend la configuration principale mais désactive les vérifications body/footer

const mainConfig = require("../.commitlintrc.js");

module.exports = {
	...mainConfig,
	rules: {
		...mainConfig.rules,
		// Désactiver les règles de body et footer pour les PR
		"body-leading-blank": [0],
		"body-max-line-length": [0],
		"body-min-length": [0],
		"body-empty": [0],
		"footer-leading-blank": [0],
		"footer-max-line-length": [0],
		"footer-min-length": [0],
		"footer-empty": [0],
		"signed-off-by": [0],
		// Garder seulement les règles du titre
		"header-max-length": mainConfig.rules["header-max-length"],
		"subject-case": mainConfig.rules["subject-case"],
		"subject-empty": mainConfig.rules["subject-empty"],
		"subject-full-stop": mainConfig.rules["subject-full-stop"],
		"type-enum": mainConfig.rules["type-enum"],
		"type-case": mainConfig.rules["type-case"],
		"type-empty": mainConfig.rules["type-empty"],
		"scope-enum": mainConfig.rules["scope-enum"],
		"scope-case": mainConfig.rules["scope-case"],
	},
};
