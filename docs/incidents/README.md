# Incidents

Ce dossier contient les post-mortems des incidents de production du dépôt. Un post-mortem reconstitue les faits d'un
incident sans chercher de coupable, identifie les conditions qui l'ont rendu probable, puis convertit chaque leçon en
contrôle (ADR, règle OPA, procédure, alerte). C'est un document d'historique : son contenu n'est pas réécrit après coup.

## Retrouver un incident

La recherche la plus rapide porte sur le champ `error_signatures` du front matter, qui liste les chaînes exactes
observées pendant l'incident. Les commandes se lancent depuis la racine du dépôt.

```sh
# Incidents correspondant à une chaîne d'erreur précise
grep -rl "Expected empty archive" docs/incidents/

# Procédures qui résolvent un incident
grep -A5 "procedures:" docs/incidents/Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md
```

L'[index des incidents](Index-des-Incidents.md) regroupe les post-mortems par famille de cause racine. Le skill
`cnpg-troubleshoot` applique la même recherche pour passer d'une erreur en cours à la procédure adaptée.

## Écrire un post-mortem

La rédaction passe par le skill [`documentation-writer`](../../.agents/skills/documentation-writer/SKILL.md), qui
renvoie vers [`references/postmortem.md`](../../.agents/skills/documentation-writer/references/postmortem.md) et les
gabarits. Le fichier se nomme `Incident-AAAA-MM-JJ-Titre-En-Francais.md`.

## Post-mortems

Du plus récent au plus ancien. Cette liste est générée par `.github/scripts/postmortem-index.py` : ne la modifie pas à
la main.

<!-- postmortem-list:start -->

| Date       | Sévérité | Statut | Post-mortem                                                                                                                                                                                                                          |
| ---------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-19 | Medium   | Open   | [ArgoCD inaccessible : nom d'hôte incompatible avec le wildcard de la Gateway Cilium](Incident-2026-06-19-ArgoCD-Inaccessible-Wildcard-Cilium-Incoherent.md)                                                                         |
| 2026-05-31 | High     | Open   | [oci.chezmoi.sh inaccessible après la migration vers Cilium Gateway API — dérive de configuration de l'agent et mauvaise identité dans la NetworkPolicy](Incident-2026-05-31-Derive-Agent-Cilium-Gateway-API-NetworkPolicy-Amiya.md) |
| 2026-05-30 | High     | Open   | [Redis en ImagePullBackOff — index.json corrompu dans Zot et limitation de débit Docker Hub](Incident-2026-05-30-ImagePullBackOff-Redis-Index-Zot-Corrompu.md)                                                                       |
| 2026-05-30 | Medium   | Open   | [PushSecrets 504 des bases de données de lungmen.akn — NetworkPolicy du namespace vault](Incident-2026-05-30-PushSecrets-504-Vault-NetworkPolicy-Lungmen.md)                                                                         |
| 2026-05-30 | Critical | Open   | [Saturation du PVC WAL de CNPG : immich et paperless-ngx indisponibles plus de 4 jours sur lungmen.akn](Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md)                                                                          |
| 2026-05-27 | Medium   | Open   | [Échec de la mise à jour Cilium 1.19 — nœud amiya.akn injoignable](Incident-2026-05-27-Echec-Mise-a-Jour-Cilium-1-19.md)                                                                                                             |
| 2026-05-26 | Low      | Open   | [Échec de la mise à jour Kubernetes 1.35 — le feature gate supprimé UserNamespacesPodSecurityStandards fait planter kube-apiserver et kubelet sur lungmen.akn](Incident-2026-05-26-Feature-Gate-Supprime-Kubernetes-1-35-Lungmen.md) |
| 2026-05-26 | Critical | Open   | [Politique de réécriture d'images Kyverno → dépendance circulaire Zot/Longhorn — ImagePullBackOff sur tout le cluster amiya.akn](Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md)                               |
| 2026-05-25 | Medium   | Open   | [Échec d'authentification Vault du ClusterSecretStore de lungmen.akn](Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen.md)                                                                                |
| 2026-05-25 | High     | Open   | [Saturation du disque de Zot : ImagePullBackOff généralisé sur lungmen.akn](Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff.md)                                                                                           |

<!-- postmortem-list:end -->

## Pour aller plus loin

- [Index des incidents](Index-des-Incidents.md) : post-mortems regroupés par famille de cause racine.
- [Plan de reprise après sinistre](../plan-de-reprise/brouillon/Plan-de-Reprise-apres-Sinistre.md) : reprise des
  services après un incident majeur.
