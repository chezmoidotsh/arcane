# Example OpenBao configuration with SoftHSMv2 PKCS#11 auto-unseal
# This configuration shows how to set up OpenBao with SoftHSMv2 for auto-unsealing

ui = true

# HTTP listener configuration
listener "tcp" {
  tls_disable     = 1
  address         = "[::]:8200"
  cluster_address = "[::]:8201"
}

# Storage backend - use file storage for development
# In production, you would typically use S3, Consul, etc.
storage "file" {
  path = "/openbao/file"
}

# PKCS#11 seal configuration for auto-unseal using SoftHSMv2
seal "pkcs11" {
  # Path to the SoftHSMv2 PKCS#11 library
  lib = "/lib/softhsm/libsofthsm2.so"
  
  # Token label - much more reliable than slot numbers which can change
  token_label = "openbao-token"
  
  # PIN for the token (default is 1234, change in production!)
  # Can also be set via SOFTHSM_USER_PIN environment variable
  pin = "1234"
  
  # Label for the encryption key that will be created/used
  key_label = "openbao-unseal-key"
  
  # Key mechanism - AES is recommended
  mechanism = "CKM_AES_GCM"
}

# Cluster configuration (for HA setups)
cluster_addr = "https://127.0.0.1:8201"
api_addr = "http://127.0.0.1:8200"

# Disable mlock if running in containers
disable_mlock = true

# Log level
log_level = "Info"

# Default lease TTL and max lease TTL
default_lease_ttl = "768h"
max_lease_ttl = "8760h" 