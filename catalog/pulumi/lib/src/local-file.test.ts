import { expect } from "chai";
import * as fs from "fs";
import { describe, it } from "mocha";
import * as os from "os";
import * as path from "path";

import { localFileChanged, writeLocalFile } from "./local-file";

describe("writeLocalFile", () => {
	it("writes the content to the given path", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-file-test-"));
		const file = path.join(dir, "out.txt");

		writeLocalFile({ path: file, content: "hello" });

		expect(fs.readFileSync(file, "utf8")).to.equal("hello");
	});

	it("creates missing parent directories", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-file-test-"));
		const file = path.join(dir, "nested", "deep", "out.txt");

		writeLocalFile({ path: file, content: "hello" });

		expect(fs.readFileSync(file, "utf8")).to.equal("hello");
	});

	it("overwrites existing content", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-file-test-"));
		const file = path.join(dir, "out.txt");

		writeLocalFile({ path: file, content: "first" });
		writeLocalFile({ path: file, content: "second" });

		expect(fs.readFileSync(file, "utf8")).to.equal("second");
	});
});

describe("localFileChanged", () => {
	it("is false when path and content are identical", () => {
		const state = { path: "/tmp/a", content: "same" };
		expect(localFileChanged(state, { ...state })).to.equal(false);
	});

	it("is true when content differs", () => {
		expect(
			localFileChanged(
				{ path: "/tmp/a", content: "old" },
				{ path: "/tmp/a", content: "new" },
			),
		).to.equal(true);
	});

	it("is true when path differs", () => {
		expect(
			localFileChanged(
				{ path: "/tmp/a", content: "same" },
				{ path: "/tmp/b", content: "same" },
			),
		).to.equal(true);
	});
});
