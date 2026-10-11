# SEC-20250808-00 Ajouter une SecurityPolicy OIDC sur une HTTPRoute

Cette procédure décrivait comment protéger une application exposée par une `HTTPRoute` avec une `SecurityPolicy` Envoy
Gateway réalisant une authentification OIDC contre Authelia. Elle est archivée car Envoy Gateway et Authelia ne sont
plus utilisés dans le dépôt.

> [!NOTE]\
> **Archivée le 2026-10-11.** Le mécanisme décrit n'existe plus dans le dépôt ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

La procédure s'appliquait à une application dont l'`HTTPRoute` était servie par Envoy Gateway, dans l'arborescence
`projects/<cluster>/src/apps/<app>/`. Les étapes étaient les suivantes :

1. Générer, avec un script à usage unique s'appuyant sur l'image Authelia, la définition JSON d'un client OIDC (PKCE
   activé, scope `openid` seul par défaut).
2. Stocker ce JSON dans Vault (OpenBao) sous `<cluster>/<app>/auth/oidc-client`, avec des métadonnées de traçabilité.
3. Déclarer le client dans les fichiers centraux d'Authelia (`authelia-oidc.externalsecret.yaml` et `authelia.yaml`),
   dans l'ordre alphabétique.
4. Créer, dans un sous-dossier `security/` de l'application, la `SecurityPolicy` (`<httproute>.securitypolicy.yaml`) et
   l'`ExternalSecret` qui lui fournit le secret du client.
5. Vérifier le stockage dans Vault, le `Secret` Kubernetes, la `SecurityPolicy` et la redirection `302` vers Authelia.

## Pourquoi il est archivé

Vérifications faites dans le dépôt le 2026-10-11 :

| Constat                                                                                 | Vérification                                                                                                                               |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Plus aucune ressource `SecurityPolicy` n'existe                                         | `grep -rln "SecurityPolicy" projects/*/src` ne renvoie aucun fichier                                                                       |
| Toutes les `Gateway` utilisent la classe `cilium` (4 occurrences)                       | `grep -rh "gatewayClassName" projects/*/src`                                                                                               |
| Authelia a été remplacé par Pocket-Id, qui est l'unique fournisseur d'identité          | commentaire de `projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts` : « rhodes.akn doesn't run Authelia — Pocket-Id is the SSO » |
| Le répertoire `projects/amiya.akn/`, cité dans l'exemple de la procédure, n'existe plus | `ls projects/amiya.akn` : fichier ou dossier introuvable                                                                                   |

Aucun dossier `*sso/authelia/` n'est présent non plus dans `projects/*/src/apps/`.

## Ce qui le remplace

Il n'y a plus de filtre OIDC posé au niveau de la passerelle : chaque application authentifie elle-même ses
utilisateurs, avec Pocket-Id comme fournisseur d'identité (voir `AGENTS.md`, sections « ArgoCD » et « Network and
security »). Pour l'exposition publique, les ressources Pangolin de `rhodes.akn` déclarent `sso: false`
(`projects/rhodes.akn/src/infrastructure/pulumi/stack/pangolin/pocket-id.ts` et `grafana.ts`) : l'authentification est
laissée à l'application, sans double contrôle.

Le détail de la configuration OIDC propre à chaque application n'est pas décrit ici ; il relève de l'application
concernée.

## Texte intégral

Le texte complet se trouve dans l'historique Git de
`docs/procedures/security/SEC-20250808-00.add-securitypolicy-on-httproute.md`, avant son archivage (issue #1257).

## Pour aller plus loin

- [ADR-005 Envoy Gateway OIDC authentication](../decisions/ADR-005-Authentification-OIDC-par-Envoy-Gateway.md) : la
  décision qui motivait cette procédure. Son statut `implemented` est contredit par le dépôt (plus de `SecurityPolicy`,
  plus d'Envoy Gateway ni d'Authelia) ; il sera corrigé lors de la migration des ADR.
