# INF-20260620-00 Installer node-exporter sur Proxmox

Cette procédure installait `prometheus-node-exporter` directement sur l'hôte Proxmox VE `pve-01` et le déclarait comme
cible de scrape dans le LXC `pve-exporter`. Elle est archivée car l'hôte envoie désormais lui-même ses métriques et ses
journaux avec un OpenTelemetry Collector, et le LXC `pve-exporter` n'existe plus.

> [!NOTE]\
> **Archivée le 2026-11-11.** Le mécanisme décrit n'existe plus dans le dépôt ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

Le récepteur `hostmetrics` de `catalog.o11yAgent` ne couvrait que le conteneur `pve-exporter`, pas l'hyperviseur : les
E/S disque de l'hôte, les capteurs matériels, la santé des NVMe et les systèmes de fichiers de l'hôte demandaient un
node-exporter sur l'hôte lui-même.

La procédure installait le paquet Debian `prometheus-node-exporter`, limitait son écoute à l'adresse de gestion de
l'hôte (`10.0.0.11:9100`) dans `/etc/default/prometheus-node-exporter`, activait les collecteurs `systemd` et
`processes` et excluait les points de montage et les disques sans intérêt. Elle ouvrait ensuite le port dans le pare-feu
du nœud (`/etc/pve/nodes/<nœud>/host.fw`, règle `IN ACCEPT -source 10.0.0.0/22 -dport 9100 -p tcp`), puis déclarait la
cible de scrape dans `o11y-agent.nix` du LXC `pve-exporter` (`10.0.0.24`) avant de pousser son image.

## Pourquoi il est archivé

Le 2026-11-11, `prometheus-node-exporter` a été purgé de l'hôte et le LXC `pve-exporter` (CT 105) a été détruit. L'hôte
exécute maintenant `otelcol-contrib`, qui envoie son journal systemd et ses métriques `hostmetrics` en OTLP/HTTP à
l'appliance d'observabilité, sans intermédiaire ni port ouvert sur l'hôte. Les métriques de l'API Proxmox VE (nœuds,
invités, stockage) viennent du serveur de métriques OpenTelemetry de Proxmox VE.

La procédure qui la remplace est
[INF-20261111-00 Installer le collecteur OpenTelemetry sur Proxmox](../procedures/infrastructure/INF-20261111-00-Installer-le-Collecteur-OpenTelemetry-sur-Proxmox.md).

## Texte intégral

Le texte d'origine est figé à
[`docs/procedures/infrastructure/INF-20260620-00-Installer-Node-Exporter-sur-Proxmox.md`](https://github.com/chezmoidotsh/arcane/blob/8bfa13fb5891b58c181746b6130e87d67af6b721/docs/procedures/infrastructure/INF-20260620-00-Installer-Node-Exporter-sur-Proxmox.md)
(commit `8bfa13fb`, dernière version avant son archivage). Le lien pointe sur un commit : il reste valable après la
suppression du fichier.

## Pour aller plus loin

- [ADR-018 OTLP comme protocole d'ingestion unique pour l'appliance d'observabilité](../decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md)
  : la décision qui a fait de l'OTLP le seul chemin d'écriture de l'appliance.
