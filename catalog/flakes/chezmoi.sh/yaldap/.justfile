nix_output_monitor_path := shell("command -v nom")
nix_cmd := if nix_output_monitor_path != "" { "nom" } else { "nix" }
bats_format := if env("CI", "···") == "···" { "pretty" } else { "junit" }

[private]
@default:
    just --choose

[doc('Display information about the flake')]
info:
    @nix flake metadata
    @echo
    @nix flake show

[doc('Build the container image base on the flake definition')]
[group('build')]
build:
    @export TMPDIR=/nix/tmp
    {{nix_cmd}} build


[doc('Run all compliance tests')]
[group('test')]
test-compliance *BATS_ARGS: build
    bats --formatter {{bats_format}} --timing --print-output-on-failure tests --filter-tags 'docker:compliance' {{BATS_ARGS}}

[doc('Run all validation tests')]
[group('test')]
test-validation *BATS_ARGS: build
    bats --formatter {{bats_format}} --timing --print-output-on-failure tests --filter-tags '!docker:compliance' {{BATS_ARGS}}

[doc('Run all tests')]
[group('test')]
test *BATS_ARGS: (test-compliance BATS_ARGS) (test-validation BATS_ARGS)
