# Intégration de CrowdSec dans Kazimierz

Ce document décrivait l'intégration de CrowdSec (WAF et détection de menaces) avec Pangolin et Traefik sur
`kazimierz.akn`. L'intégration a été essayée puis abandonnée : plus rien ne la déploie.

> [!NOTE]\
> **Archivée le 2026-10-11.** L'intégration est abandonnée ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

Le document détaillait le branchement de CrowdSec sur le reverse proxy Traefik de la pile Pangolin, déployée par un rôle
Ansible `pangolin`. Un service CrowdSec jouait le moteur de détection de menaces et de décision, et exposait une LAPI
(port 8080). Un plugin Traefik servait de bouncer : il appliquait les décisions et interrogeait le composant AppSec
(port 7422). CrowdSec lisait enfin les logs d'accès de Traefik par un volume partagé.

Le texte couvrait aussi la configuration Docker Compose et la configuration statique et dynamique de Traefik, avec le
middleware `crowdsec` appliqué globalement. Côté Ansible, il décrivait la génération de la clé API du bouncer, régénérée
quand le hash du template `dynamic_config.yml.j2` change. Il listait les collections CrowdSec installées (`traefik`,
`appsec-virtual-patching`, `appsec-generic-rules`, `appsec-crs-inband`) et la confiance accordée aux IP internes et à
Tailscale pour la détection de l'IP cliente. Il se terminait par des commandes de vérification et un guide de dépannage
: erreurs 403 du bouncer, absence de décisions, AppSec qui ne bloque pas.

## Pourquoi il est archivé

L'en-tête de l'ancien texte consignait déjà la décision finale : CrowdSec a été essayé puis abandonné, car son bouncer
de renseignement sur les menaces partagé produisait des faux positifs qui bloquaient des invités légitimes. La
protection repose depuis sur les contrôles d'accès propres à Pangolin, dont le géoblocage par GeoIP.

L'état du dépôt confirme l'abandon (vérifié le 2026-10-11). Aucune occurrence de `crowdsec` (insensible à la casse)
n'existe sous `projects/kazimierz.akn/`, ni dans la configuration NixOS (`src/infrastructure/nixos/`) ni dans les stacks
Pulumi. Le répertoire `src/infrastructure/` ne contient que `nixos` et `pulumi` : le rôle Ansible `pangolin` cité dans
l'ancien texte n'existe plus, la configuration de `kazimierz.akn` ayant migré d'Ansible vers NixOS
([ADR-016](../decisions/016-kazimierz-nixos-over-ansible.md)). La seule mention restante dans `docs/decisions/` est une
ligne de l'historique de l'ADR-008 (« CrowdSec addition »), qui relate l'ajout passé.

La raison de l'abandon (faux positifs du bouncer partagé) provient de l'en-tête de l'ancien document ; aucune autre
source du dépôt ne la confirme.

## Texte intégral

Le texte d'origine, en anglais, est figé à
[`projects/kazimierz.akn/docs/archives/CROWDSEC-INTEGRATION.md`](https://github.com/chezmoidotsh/arcane/blob/7cc2722063ade67d993ef8f20851b6c96a86d636/projects/kazimierz.akn/docs/archives/CROWDSEC-INTEGRATION.md)
(commit `7cc27220`, dernière version avant la migration de la documentation, issue #1257). Le lien pointe sur un commit
: il reste valable après la suppression du fichier.

## Pour aller plus loin

- [Initialiser Kazimierz](../guides/Initialiser-Kazimierz.md) : la mise en place actuelle de `kazimierz.akn`.
- [ADR-016 Kazimierz NixOS plutôt qu'Ansible](../decisions/016-kazimierz-nixos-over-ansible.md) : la décision qui a
  remplacé la configuration Ansible.
