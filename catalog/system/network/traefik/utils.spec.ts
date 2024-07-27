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
import { describe, expect, it } from "vitest";

import { splitHostPortProtocol } from "./utils";

describe("#splitHostPortProtocol", () => {
    Object.entries({
        ":80": ["", 80, "tcp"],
        "localhost:80": ["localhost", 80, "tcp"],
        "[::1]:80": ["[::1]", 80, "tcp"],
        ":80/tcp": ["", 80, "tcp"],
        ":80/udp": ["", 80, "udp"],
        "localhost:80/tcp": ["localhost", 80, "tcp"],
        "localhost:80/udp": ["localhost", 80, "udp"],
        "[::1]:80/tcp": ["[::1]", 80, "tcp"],
        "[::1]:80/udp": ["[::1]", 80, "udp"],
        ":invalid": undefined,
        localhost: undefined,
        "localhost:invalid": undefined,
        ":80/invalid": undefined,
    }).forEach(([input, expected]) => {
        it(`should split "${input}"`, () => {
            expect(splitHostPortProtocol(input)).toEqual(expected);
        });
    });
});
