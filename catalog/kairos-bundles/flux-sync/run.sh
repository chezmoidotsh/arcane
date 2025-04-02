#!/usr/bin/env bash
set -x

mkdir -p /usr/local/bin &&
	cp flux /usr/local/bin/flux

mkdir -p /opt/kairos/bundles/flux-sync &&
	cp -r flux-sync.sh /opt/kairos/bundles/flux-sync/flux-sync.sh &&
	chmod +x /opt/kairos/bundles/flux-sync/flux-sync.sh

mkdir -p /etc/systemd/system &&
	cp flux-sync.service /etc/systemd/system/flux-sync.service

systemctl daemon-reload
systemctl enable --now flux-sync.service
