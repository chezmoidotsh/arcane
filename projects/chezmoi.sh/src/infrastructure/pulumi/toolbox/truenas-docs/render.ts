import * as fs from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";

import { registerHelpers } from "./helpers";

const TEMPLATES_DIR = path.join(__dirname, "templates");
const ROOT_TEMPLATE = "root.hbs";
const PARTIAL_PREFIX = "partials.";

/**
 * Compiles `templates/root.hbs` with every `templates/partials.*.hbs` and
 * renders it against `context`. Pure -- no Pulumi, no network, no filesystem
 * writes -- so `./render.test.ts` can exercise the full document from a
 * fixture.
 *
 * A partial file named `partials.backups.hbs` registers as `backups`, which
 * is what `{{> backups}}` in the root template resolves to.
 */
export function render(context: unknown): string {
	const handlebars = Handlebars.create();
	registerHelpers(handlebars);

	for (const file of fs.readdirSync(TEMPLATES_DIR)) {
		if (!file.startsWith(PARTIAL_PREFIX) || !file.endsWith(".hbs")) continue;
		const name = file.slice(PARTIAL_PREFIX.length, -".hbs".length);
		handlebars.registerPartial(
			name,
			fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf8"),
		);
	}

	const template = handlebars.compile(
		fs.readFileSync(path.join(TEMPLATES_DIR, ROOT_TEMPLATE), "utf8"),
	);
	return template(context);
}
