#!/user/bin/env bats
# Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ----------------------------------------------------------------------------
bats_load_library bats-support
bats_load_library bats-assert

# bats test_tags=docker:compliance
@test "${BATS_APP_NAME} has all required labels." {
    run docker image inspect --format '{{ range $k, $v := .Config.Labels }}{{ printf "%s = %s\n" $k $v }}{{ end }}' "${BATS_DOCKER_IMAGE_NAME}"
    assert_success

    assert_line --partial 'org.opencontainers.image.authors'
    assert_line --partial 'org.opencontainers.image.description'
    assert_line --partial 'org.opencontainers.image.documentation'
    assert_line 'org.opencontainers.image.licenses = Apache-2.0'
    assert_line --partial 'org.opencontainers.image.revision'
    assert_line --partial 'org.opencontainers.image.source'
    assert_line --partial 'org.opencontainers.image.title'
    assert_line --partial 'org.opencontainers.image.url'
    assert_line --partial 'org.opencontainers.image.version'
    assert_line 'sh.chezmoi.catalog.build.engine.type = nix'
    assert_line --partial 'sh.chezmoi.catalog.build.engine.version'
    assert_line --partial 'sh.chezmoi.catalog.category'
    assert_line --partial 'sh.chezmoi.catalog.origin.author'
    assert_line --partial 'sh.chezmoi.catalog.origin.license'
    assert_line --partial 'sh.chezmoi.catalog.origin.repository'
}

# bats test_tags=docker:compliance
@test "${BATS_APP_NAME} has a valid user configured." {
    run docker image inspect --format '{{ .Config.User }}' "${BATS_DOCKER_IMAGE_NAME}"
    assert_success

    [[ "${output}" = "" ]] && fail "User is not set."
    [[ "${output}" = "0" ]] && fail "User must not be root."
    [[ "${output}" = "0:0" ]] && fail "User must not be root."
    [[ "${output}" =~ ^(102[5-9]|10[3-9][0-9]|1[1-9][0-9]{2}|[2-9][0-9]{3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]):(102[5-9]|10[3-9][0-9]|1[1-9][0-9]{2}|[2-9][0-9]{3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$ ]] || fail "User must be a valid UID:GID pair (1024 < UID|GID < 65536)."
}

# bats test_tags=docker:compliance
@test "${BATS_APP_NAME} has an healthcheck configured." {
    run docker image inspect --format '{{ .Config.Healthcheck }}' "${BATS_DOCKER_IMAGE_NAME}"
    if [[ "${status}" -ne 0 ]]; then
        skip "No healthcheck found."
    fi

    run docker image inspect --format '{{ .Config.Healthcheck.Test }}' "${BATS_DOCKER_IMAGE_NAME}"
    refute_regex "${output}" "CMD-SHELL" # NOTE: no shell must be installed in the image
}
