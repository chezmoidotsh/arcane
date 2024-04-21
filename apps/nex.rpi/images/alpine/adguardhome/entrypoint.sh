#!/bin/sh

# Copy the default configuration file to /etc/adguardhome because this folder is
# mounted as a volume and the configuration file is not present in the image.
cp /opt/adguardhome/config/AdGuardHome.yaml /etc/adguardhome/AdGuardHome.yaml

# Start AdGuard Home
exec /opt/adguardhome/bin/AdGuardHome \
	--no-check-update \
	--config /etc/adguardhome/AdGuardHome.yaml \
	--work-dir /var/lib/adguardhome
