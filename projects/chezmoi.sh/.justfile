mod crossplane 'src/infrastructure/.justfile'
mod kubernetes 'src/.justfile'

[private]
@default:
    just --list --list-submodules
