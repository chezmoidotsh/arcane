# Allow ESO to read all secrets in the project path
path "{{ .projectName }}/*" { capabilities = ["read"] }

# Allow ESO to read all secrets in the shared/third-parties path
path "shared/third-parties/+/+/{{ .projectName }}/*" { capabilities = ["read"] }
