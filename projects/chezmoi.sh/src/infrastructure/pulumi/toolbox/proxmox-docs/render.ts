import * as fs from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";

import { registerHelpers } from "./helpers";

/**
 * Compiles `template.hbs` (with `./partials/*.hbs`) and renders it against
 * `context`. Pure -- no Pulumi, no network, no filesystem writes -- so
 * `./render.test.ts` can exercise the full document from a fixture.
 *
 * A partial file named `partials/acme.dns01.hbs` registers as `acme.dns01`,
 * which is what `{{> [acme.dns01]}}` in a parent template resolves to.
 */
export function render(context: unknown): string {
	const handlebars = Handlebars.create();
	registerHelpers(handlebars);

	const partialsDir = path.join(__dirname, "partials");
	for (const file of fs.readdirSync(partialsDir)) {
		const name = path.basename(file, ".hbs");
		handlebars.registerPartial(
			name,
			fs.readFileSync(path.join(partialsDir, file), "utf8"),
		);
	}

	const template = handlebars.compile(
		fs.readFileSync(path.join(__dirname, "template.hbs"), "utf8"),
	);
	return template(context);
}
