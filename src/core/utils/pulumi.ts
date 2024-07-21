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
import * as pulumi from "@pulumi/pulumi";

/**
 * {@link pulumi.ProviderResource} is a resource that implements CRUD operations for
 * other custom resources. This type is used to enforce that the provider as a static
 * method `isInstance` that can be used to check if a given object is an instance of
 * the provider.
 */
type ProviderResource<T extends pulumi.ProviderResource> = {
    isInstance: (obj: any) => obj is T;
};

/**
 * getProvider returns the provider from the given options if it exists.
 * @param provider The provider to check for.
 * @param opts The options to check for the provider.
 * @returns The provider if it exists, otherwise undefined.
 */
export function getProvider<T extends pulumi.ProviderResource>(
    provider: ProviderResource,
    opts: pulumi.ComponentResourceOptions | undefined,
): pulumi.ProviderResource | undefined {
    if (opts === undefined) {
        return undefined;
    }

    if (opts?.provider !== undefined && provider.isInstance(opts.provider)) {
        return opts.provider;
    }

    if (opts?.providers === undefined) {
        return;
    }

    const providers = opts.providers;
    if (Array.isArray(providers)) {
        for (const p of providers) {
            if (provider.isInstance(p)) {
                return p;
            }
        }
    } else {
        for (const [_, p] of Object.entries(providers)) {
            if (provider.isInstance(p)) {
                return p;
            }
        }
    }
}
