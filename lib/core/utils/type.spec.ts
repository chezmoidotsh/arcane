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
import { expect } from "chai";
import { IsDefined } from "./type";

describe("IsDefined", () => {
    it("should return false for undefined values", () => {
        const undefinedValue = undefined;
        const result = IsDefined(undefinedValue);
        expect(result).to.be.false;
    });

    it("should return true for defined values (null)", () => {
        const nullValue = null;
        const result = IsDefined(nullValue);
        expect(result).to.be.true;
    });

    it("should return true for defined values (empty string)", () => {
        const emptyStringValue = "";
        const result = IsDefined(emptyStringValue);
        expect(result).to.be.true;
    });

    it("should return true for defined values (false)", () => {
        const falseValue = false;
        const result = IsDefined(falseValue);
        expect(result).to.be.true;
    });

    it("should return true for defined values (0)", () => {
        const zeroValue = 0;
        const result = IsDefined(zeroValue);
        expect(result).to.be.true;
    });

    it("should return true for defined values (object)", () => {
        const objValue = { key: "value" };
        const result = IsDefined(objValue);
        expect(result).to.be.true;
    });

    it("should return true for defined values (array)", () => {
        const arrayValue: number[] = [1, 2, 3];
        const result = IsDefined(arrayValue);
        expect(result).to.be.true;
    });
});
