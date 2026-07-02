#!/usr/bin/env bash
# Deletes the disposable kind sandbox and everything in it.
set -euo pipefail
kind delete cluster --name pulumi-poc
