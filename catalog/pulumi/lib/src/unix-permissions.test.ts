import { expect } from "chai";
import { describe, it } from "mocha";

import { parseUnixMode } from "./unix-permissions";

describe("parseUnixMode", () => {
	it("parses a fully-open mode", () => {
		expect(parseUnixMode("rwxrwxrwx")).to.deep.equal({
			owner: { read: true, write: true, execute: true },
			group: { read: true, write: true, execute: true },
			other: { read: true, write: true, execute: true },
		});
	});

	it("parses a fully-closed mode", () => {
		expect(parseUnixMode("---------")).to.deep.equal({
			owner: { read: false, write: false, execute: false },
			group: { read: false, write: false, execute: false },
			other: { read: false, write: false, execute: false },
		});
	});

	it("parses a mixed, real-world mode (owner-only access)", () => {
		expect(parseUnixMode("rwx------")).to.deep.equal({
			owner: { read: true, write: true, execute: true },
			group: { read: false, write: false, execute: false },
			other: { read: false, write: false, execute: false },
		});
	});

	it("parses read+execute without write", () => {
		expect(parseUnixMode("rwxrwxr-x")).to.deep.equal({
			owner: { read: true, write: true, execute: true },
			group: { read: true, write: true, execute: true },
			other: { read: true, write: false, execute: true },
		});
	});

	it("throws on a mode that isn't 9 characters", () => {
		expect(() => parseUnixMode("rwx")).to.throw(/9-character/);
		expect(() => parseUnixMode("rwxrwxrwxrwx")).to.throw(/9-character/);
	});

	it("throws on an invalid triad", () => {
		expect(() => parseUnixMode("rwzrwxrwx")).to.throw(
			/invalid permission triad/,
		);
	});
});
