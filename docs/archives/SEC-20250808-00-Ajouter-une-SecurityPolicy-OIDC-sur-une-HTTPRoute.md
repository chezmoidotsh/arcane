# SEC-20250808-00 Ajouter une SecurityPolicy OIDC sur une HTTPRoute

Cette procédure décrivait comment protéger une application exposée par une `HTTPRoute` avec une `SecurityPolicy` Envoy
Gateway réalisant une authentification OIDC contre Authelia. Elle est archivée car Envoy Gateway et Authelia ne sont
plus utilisés dans le dépôt.

> [!NOTE]\
> **Archivée le 2026-10-11.** Le mécanisme décrit n'existe plus dans le dépôt ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

La procédure s'appliquait à une application dont l'`HTTPRoute` était servie par Envoy Gateway, dans l'arborescence
`projects/<cluster>/src/apps/<app>/`. Un script à usage unique, qui s'appuyait sur l'image Authelia, générait la
définition JSON d'un client OIDC (PKCE activé, scope `openid` seul par défaut). Ce JSON était stocké dans Vault
(OpenBao) sous `<cluster>/<app>/auth/oidc-client`, avec des métadonnées de traçabilité, puis le client était déclaré
dans les fichiers centraux d'Authelia (`authelia-oidc.externalsecret.yaml` et `authelia.yaml`), dans l'ordre
alphabétique.

Dans un sous-dossier `security/` de l'application, on créait ensuite la `SecurityPolicy`
(`<httproute>.securitypolicy.yaml`) et l'`ExternalSecret` qui lui fournit le secret du client. La procédure se terminait
par la vérification du stockage dans Vault, du `Secret` Kubernetes, de la `SecurityPolicy` et de la redirection `302`
vers Authelia.

## Pourquoi il est archivé

Rien ne remplace cette procédure : il n'y a plus de filtre OIDC posé au niveau de la passerelle, et chaque application
authentifie elle-même ses utilisateurs avec Pocket-Id comme fournisseur d'identité (voir `AGENTS.md`, sections « ArgoCD
» et « Network and security »). Il n'existe plus d'application exposée sans OIDC, donc plus rien à protéger par une
`SecurityPolicy`. Le détail de la configuration OIDC propre à chaque application relève de l'application concernée.

Le dépôt le confirme au 2026-10-11. `grep -rln "SecurityPolicy" projects/*/src` ne renvoie aucun fichier, et toutes les
`Gateway` utilisent la classe `cilium` (`grep -rh "gatewayClassName" projects/*/src` : 4 occurrences). Aucun dossier
`*sso/authelia/` n'est présent dans `projects/*/src/apps/`, et le commentaire de
`projects/rhodes.akn/src/infrastructure/pulumi/stack/vault.ts` dit que « rhodes.akn doesn't run Authelia — Pocket-Id is
the SSO ». Le répertoire `projects/amiya.akn/`, cité dans l'exemple de la procédure, n'existe plus non plus.

Pour l'exposition publique, les ressources Pangolin de `rhodes.akn` déclarent `sso: false`
(`projects/rhodes.akn/src/infrastructure/pulumi/stack/pangolin/pocket-id.ts` et `grafana.ts`) : l'authentification est
laissée à l'application, sans double contrôle.

## Texte intégral

Le texte d'origine, en anglais, est figé à
[`docs/procedures/security/SEC-20250808-00.add-securitypolicy-on-httproute.md`](https://github.com/chezmoidotsh/arcane/blob/996fced241ffce850399e83fbca2755549fbd40f/docs/procedures/security/SEC-20250808-00.add-securitypolicy-on-httproute.md)
(commit `996fced2`, dernière version avant la migration de la documentation, issue #1257). Le lien pointe sur un commit
: il reste valable après la suppression du fichier.

## Pour aller plus loin

- [ADR-005 Authentification OIDC par Envoy Gateway](../decisions/ADR-005-Authentification-OIDC-par-Envoy-Gateway.md) :
  la décision qui motivait cette procédure, dépréciée depuis (plus de `SecurityPolicy`, plus d'Envoy Gateway ni
  d'Authelia).
