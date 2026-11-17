import { expect } from "chai";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { decryptSopsFile, sopsFileProvider } from "./index";

const have = (bin: string) => spawnSync(bin, ["--version"]).status === 0;

describe("SopsFile provider", function () {
	// Under the package (not os.tmpdir) so mise's sops shim resolves a version from the repo config.
	let dir = "";
	after(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

	before(function () {
		if (!have("sops") || !have("age-keygen")) this.skip();
	});

	it("creates from nothing, keeps JSON types, detects drift, updates and deletes", async function () {
		dir = fs.mkdtempSync(path.join(__dirname, ".tmp-"));
		const keyFile = path.join(dir, "key.txt");
		const keygen = spawnSync("age-keygen", ["-o", keyFile], { encoding: "utf8" });
		const recipient = /public key: (\S+)/i.exec(keygen.stderr + keygen.stdout)![1];
		fs.writeFileSync(path.join(dir, ".sops.yaml"), `creation_rules:\n  - age: ${recipient}\n`);
		// SOPS_AGE_KEY, not _FILE: the mise shim of sops would reset SOPS_AGE_KEY_FILE to the repo key.
		process.env.SOPS_AGE_KEY = fs.readFileSync(keyFile, "utf8");

		const file = path.join(dir, "o11y.sops.json");
		const content = { token: "a", port: 4318, tls: true, nested: { list: [1, 2] } };
		// Explicit config from elsewhere: the .sops.yaml next to the file is not the one used.
		const config = path.join(dir, "override.sops.yaml");
		fs.renameSync(path.join(dir, ".sops.yaml"), config);
		const props = { file, config, content };

		await sopsFileProvider.create!(props);
		expect(fs.readFileSync(file, "utf8")).to.not.contain('"a"');
		const read = decryptSopsFile<typeof content>(file, config);
		expect(read.port).to.be.a("number");
		expect(read.tls).to.equal(true);
		expect(read.nested.list).to.deep.equal([1, 2]);

		// Same content, different key order: no change.
		const same = { file, config, content: { nested: { list: [1, 2] }, tls: true, port: 4318, token: "a" } };
		expect((await sopsFileProvider.diff!("id", props, same)).changes).to.equal(false);

		// Hand edit => refresh reports the file content, diff then wants an update.
		fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/"nested"/, '"nested"'));
		const refreshed = await sopsFileProvider.read!("id", props);
		expect(refreshed.props!.content).to.deep.equal(content);

		// Missing file => null content => rewrite.
		fs.rmSync(file);
		const gone = await sopsFileProvider.read!("id", props);
		expect((await sopsFileProvider.diff!("id", gone.props!, props)).changes).to.equal(true);
		await sopsFileProvider.update!("id", gone.props!, props);
		expect(decryptSopsFile(file, config)).to.deep.equal(content);

		await sopsFileProvider.delete!("id", props);
		expect(fs.existsSync(file)).to.equal(false);
	});
});
