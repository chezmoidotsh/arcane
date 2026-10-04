# catalog/opa/

OPA/Rego policies for CI-time validation of Kubernetes manifests. Enforced via [conftest](https://www.conftest.dev/) in
the GitHub Actions compliance workflows, on the rendered `dist/` manifests.

Policies are CI-only — they do **not** mutate resources at runtime, keeping the cluster free of admission webhook
dependencies.

## Structure

```text
policies/   Rego policies and unit tests (<RULE>:<target>.rego)
rules/      Rule documentation (rationale, references, exclusions)
```

## Running locally

```sh
# Check a single manifest
mise exec conftest -- conftest test <manifest.yaml> -p catalog/opa/policies/

# Check every manifest of a rendered directory, as the compliance workflows do
mise exec conftest -- conftest test projects/<cluster>/dist/<app> -p catalog/opa/policies/ --combine

# Run all unit tests
mise exec opa -- opa test catalog/opa/policies/ -v
```

## Adding policies

1. Write a Rego policy in `policies/` using `deny[msg]` rules.
2. Write a companion `_test.rego` file using OPA's
   [policy testing](https://www.openpolicyagent.org/docs/latest/policy-testing/).
3. Add rule documentation in `rules/`.
4. CI picks up new `.rego` files automatically.
