import * as fs from "fs";
import * as Handlebars from "handlebars";
import * as path from "path";

import { registerHelpers } from "./helpers";

/** Compiles `template.hbs` (with `./partials/*.hbs`) and renders it against `context`. Pure -- no Pulumi, no network. */
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
