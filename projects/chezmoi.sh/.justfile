mod crossplane 'src/infrastructure/.justfile'
mod kubernetes 'src/.justfile'
mod vault 'src/kubevault/.justfile'

[private]
@default:
    just --list --list-submodules
