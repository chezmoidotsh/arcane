# Incidents

Écrite le 2026-10-11 à partir du dépôt.

Cette page présente les post-mortems du dépôt : à quoi ils servent, comment en lire un, comment retrouver celui qui
correspond à une erreur en cours, et comment en écrire un nouveau. La liste des post-mortems existants se trouve en fin
de page.

## À quoi servent les post-mortems

Un post-mortem documente un incident de production sans chercher de coupable : il reconstitue la chronologie, identifie
les conditions qui ont rendu l'incident probable, puis convertit chaque leçon en contrôle (ADR, règle OPA, procédure,
alerte). Il remplit trois fonctions :

- **Mémoire** : reconstituer les faits sans biais rétrospectif (chronologie, décisions, signaux).
- **Boucle de rétroaction** : vérifier, à une date fixée, que le système a réellement changé.
- **Pression structurelle** : imposer un changement qui rend la classe d'incident improbable.

Chaque post-mortem est un document d'historique : le contenu, la chronologie et le front matter ne sont pas réécrits
après coup.

## Lire un post-mortem

Chaque fichier `Incident-AAAA-MM-JJ-Titre.md` suit le gabarit
[`postmortem.md`](../../.agents/skills/documentation-writer/templates/postmortem.md) (ou sa version courte
`postmortem-lite.md`). Il commence par un front matter structuré, lu par les scripts et par les agents :

| Champ               | Contenu                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| `severity`          | Gravité : `Critical`, `High`, `Medium` ou `Low`                                        |
| `status`            | `Draft`, `Open`, `Verified` ou `Closed`                                                |
| `root-cause-family` | Familles de causes racines (liste), base du regroupement dans `Index-des-Incidents.md` |
| `error_signatures`  | Chaînes exactes relevées dans les événements, journaux ou conditions Kubernetes        |
| `procedures`        | Chemins des procédures de `docs/procedures/` qui résolvent cette classe d'incident     |

Les sections du corps suivent le gabarit : Résumé exécutif, Chronologie, Analyse des causes racines, Leçons systémiques,
Registre des changements, Connaissances pour les agents, Suivi de résolution. Un post-mortem sans procédure liée est
incomplet.

## Retrouver un incident

La recherche la plus rapide porte sur le champ `error_signatures` : chaque incident y déclare les chaînes exactes
observées. Les commandes se lancent depuis la racine du dépôt.

```sh
# Incidents correspondant à une chaîne d'erreur précise
grep -rl "Expected empty archive" docs/incidents/

# Incidents concernant un composant
grep -rlE "cnpg|barman" docs/incidents/

# Procédures référencées par un incident
grep -A5 "procedures:" docs/incidents/Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md
```

Le skill `cnpg-troubleshoot` (`.agents/skills/cnpg-troubleshoot/SKILL.md`) applique le même principe pour passer d'une
erreur en cours à la procédure adaptée.

L'[index des incidents](Index-des-Incidents.md) regroupe les post-mortems par famille de cause racine. Il est généré par
`.github/scripts/postmortem-index.py` et ne s'édite pas à la main. Une famille qui atteint trois incidents devient
candidate à un chantier structurel dédié plutôt qu'à un énième correctif.

## Suivi des actions

Les actions du « Registre des changements » portent une échéance au format `[due:: AAAA-MM-JJ]`. Le workflow
`.github/workflows/schedule.postmortem-followup.yaml` s'exécute chaque jour et appelle
`.github/scripts/postmortem-followup.py` : pour chaque post-mortem en `status: Open`, les actions échues sans issue
existante deviennent des issues GitHub. Les post-mortems déjà rédigés écrivent leurs balises `\[due::`, `\[priority::`,
`\[size::` et `\[owner::` avec un crochet échappé : ce sont des archives, le workflow les ignore et n'ouvre aucune issue
pour elles.

## Écrire un post-mortem

La rédaction passe par le skill [`documentation-writer`](../../.agents/skills/documentation-writer/SKILL.md), qui route
vers le guide `references/postmortem.md` et les gabarits. Points à respecter :

- Fichier `docs/incidents/Incident-AAAA-MM-JJ-Titre-En-Francais.md`, titre `# Incident AAAA-MM-JJ Titre`.
- Gabarit complet pour un incident de plus de deux heures, avec perte de données ou leçon systémique ; gabarit court
  sinon.
- Chaque horodatage a une source (journal, historique shell, commit, âge de Pod) ; aucun n'est inventé.
- Clés du front matter, valeurs d'énumération et syntaxe des actions inchangées : les scripts les lisent.
- Dernière section : `## Pour aller plus loin`.

## Post-mortems existants

| Date       | Titre                                                                                                                                            | Lien                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-25 | lungmen.akn ClusterSecretStore Vault Authentication Failure                                                                                      | [Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen](Incident-2026-05-25-Echec-Authentification-Vault-ClusterSecretStore-Lungmen.md) |
| 2026-05-25 | Zot registry disk saturation — widespread ImagePullBackOff on lungmen.akn                                                                        | [Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff](Incident-2026-05-25-Saturation-Disque-Zot-ImagePullBackOff.md)                                   |
| 2026-05-26 | Kyverno image-rewrite policy → Zot/Longhorn circular dependency — cluster-wide ImagePullBackOff on amiya.akn                                     | [Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya](Incident-2026-05-26-ImagePullBackOff-Circulaire-Kyverno-Zot-Amiya.md)                     |
| 2026-05-26 | Kubernetes 1.35 upgrade failure — removed feature gate UserNamespacesPodSecurityStandards causes kube-apiserver and kubelet crash on lungmen.akn | [Incident-2026-05-26-Feature-Gate-Supprime-Kubernetes-1-35-Lungmen](Incident-2026-05-26-Feature-Gate-Supprime-Kubernetes-1-35-Lungmen.md)                     |
| 2026-05-27 | Cilium 1.19 upgrade failure — amiya.akn node unreachable                                                                                         | [Incident-2026-05-27-Echec-Mise-a-Jour-Cilium-1-19](Incident-2026-05-27-Echec-Mise-a-Jour-Cilium-1-19.md)                                                     |
| 2026-05-30 | CNPG WAL PVC saturation — immich and paperless-ngx down 4+ days on lungmen.akn                                                                   | [Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured](Incident-2026-05-30-WAL-Plein-CNPG-Apps-Secured.md)                                                         |
| 2026-05-30 | lungmen.akn databases PushSecrets 504 — vault namespace NetPol                                                                                   | [Incident-2026-05-30-PushSecrets-504-Vault-NetworkPolicy-Lungmen](Incident-2026-05-30-PushSecrets-504-Vault-NetworkPolicy-Lungmen.md)                         |
| 2026-05-30 | Redis ImagePullBackOff — Zot corrupted index.json + Docker Hub rate limiting                                                                     | [Incident-2026-05-30-ImagePullBackOff-Redis-Index-Zot-Corrompu](Incident-2026-05-30-ImagePullBackOff-Redis-Index-Zot-Corrompu.md)                             |
| 2026-05-31 | oci.chezmoi.sh unreachable after Cilium Gateway API migration — agent config drift + wrong network policy identity                               | [Incident-2026-05-31-Derive-Agent-Cilium-Gateway-API-NetworkPolicy-Amiya](Incident-2026-05-31-Derive-Agent-Cilium-Gateway-API-NetworkPolicy-Amiya.md)         |
| 2026-06-19 | ArgoCD inaccessible — Cilium Gateway wildcard hostname mismatch                                                                                  | [Incident-2026-06-19-ArgoCD-Inaccessible-Wildcard-Cilium-Incoherent](Incident-2026-06-19-ArgoCD-Inaccessible-Wildcard-Cilium-Incoherent.md)                   |

Les titres sont ceux du front matter de chaque post-mortem.

## Pour aller plus loin

- [Index des incidents](Index-des-Incidents.md) : post-mortems regroupés par famille de cause racine.
- [Plan de reprise après sinistre](../guides/Plan-de-Reprise-apres-Sinistre.md) : reprise des services après un incident
  majeur.
- [Skill documentation-writer](../../.agents/skills/documentation-writer/SKILL.md) : guide de style, gabarits et
  rédaction d'un post-mortem.
