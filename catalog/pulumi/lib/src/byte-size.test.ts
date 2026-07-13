import { expect } from "chai";
import { describe, it } from "mocha";

import { ByteSize } from "./byte-size";

describe("ByteSize", () => {
	it("holds the IEC binary (base-1024) magnitudes", () => {
		expect(ByteSize.Ki).to.equal(1024);
		expect(ByteSize.Mi).to.equal(1024 * 1024);
		expect(ByteSize.Gi).to.equal(1024 * 1024 * 1024);
		expect(ByteSize.Ti).to.equal(1024 * 1024 * 1024 * 1024);
	});
});
