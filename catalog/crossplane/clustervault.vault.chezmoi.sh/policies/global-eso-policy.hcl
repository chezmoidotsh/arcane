# Allow ESO to read all certificates in the shared/certificates path
path "shared/+/certificates/*" { capabilities = ["read"] }
