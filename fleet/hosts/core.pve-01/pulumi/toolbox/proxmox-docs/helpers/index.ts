import type * as Handlebars from "handlebars";

import { countWord } from "./count-word";
import { eq } from "./eq";
import { humanList } from "./human-list";
import { isSingular } from "./is-singular";
import { yesNo } from "./yes-no";

/** Registers every helper in this folder on `handlebars`. One helper per file; this is the only place they are wired up. */
export function registerHelpers(handlebars: typeof Handlebars): void {
	handlebars.registerHelper("humanList", (arr: unknown[]) => humanList(arr));
	handlebars.registerHelper("countWord", (value: unknown[] | number) =>
		countWord(value),
	);
	handlebars.registerHelper("isSingular", (arr: unknown[]) => isSingular(arr));
	handlebars.registerHelper("yesNo", (value: unknown) => yesNo(value));
	handlebars.registerHelper("eq", (a: unknown, b: unknown) => eq(a, b));
}

export { countWord, eq, humanList, isSingular, yesNo };
