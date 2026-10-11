# Intégration de CrowdSec dans Kazimierz

Ce document décrivait l'intégration de CrowdSec (WAF et détection de menaces) avec Pangolin et Traefik sur
`kazimierz.akn`. L'intégration a été essayée puis abandonnée : plus rien ne la déploie.

> [!NOTE]\
> **Archivée le 2026-10-11.** L'intégration est abandonnée ; ce document n'est plus tenu à jour.

## Ce que couvrait le document

Le document détaillait le branchement de CrowdSec sur le reverse proxy Traefik de la pile Pangolin, déployée par un rôle
Ansible `pangolin`.

| Composant        | Rôle                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| Service CrowdSec | Moteur de détection de menaces et de décision, exposant une LAPI (port 8080) |
| Plugin Traefik   | Bouncer qui applique les décisions et interroge le composant AppSec (7422)   |
| Analyse de logs  | CrowdSec lit les logs d'accès de Traefik via un volume partagé               |

Le texte couvrait aussi :

- la configuration Docker Compose, la configuration statique et dynamique de Traefik (middleware `crowdsec` appliqué
  globalement) ;
- l'automatisation Ansible : génération de la clé API du bouncer, régénération conditionnée au hash du template
  `dynamic_config.yml.j2` ;
- les collections CrowdSec installées (`traefik`, `appsec-virtual-patching`, `appsec-generic-rules`,
  `appsec-crs-inband`) ;
- la confiance accordée aux IP internes et à Tailscale pour la détection de l'IP cliente ;
- des commandes de vérification et un guide de dépannage (erreurs 403 du bouncer, absence de décisions, AppSec qui ne
  bloque pas).

## Pourquoi il est archivé

L'en-tête de l'ancien texte consignait déjà la décision finale : CrowdSec a été essayé puis abandonné, car son bouncer
de renseignement sur les menaces partagé produisait des faux positifs qui bloquaient des invités légitimes. La
protection repose depuis sur les contrôles d'accès propres à Pangolin, dont le géoblocage par GeoIP.

L'état du dépôt confirme l'abandon (vérifié le 2026-10-11) :

- aucune occurrence de `crowdsec` (insensible à la casse) sous `projects/kazimierz.akn/`, donc ni dans la configuration
  NixOS (`src/infrastructure/nixos/`) ni dans les stacks Pulumi ;
- le répertoire `src/infrastructure/` ne contient que `nixos` et `pulumi` : le rôle Ansible `pangolin` cité dans
  l'ancien texte n'existe plus, la configuration de `kazimierz.akn` ayant migré d'Ansible vers NixOS
  ([ADR-016](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md)) ;
- la seule mention restante dans `docs/decisions/` est une ligne de l'historique de l'ADR-008 (« CrowdSec addition »),
  qui relate l'ajout passé.

La raison de l'abandon (faux positifs du bouncer partagé) provient de l'en-tête de l'ancien document ; aucune autre
source du dépôt ne la confirme.

## Texte intégral

La version complète est dans l'historique Git du fichier `projects/kazimierz.akn/docs/archives/CROWDSEC-INTEGRATION.md`,
avant son déplacement vers `docs/archives/` lors de la migration de la documentation (issue #1257).

## Pour aller plus loin

- [Initialiser Kazimierz](../guides/Initialiser-Kazimierz.md) : la mise en place actuelle de `kazimierz.akn`.
- [ADR-016 Kazimierz NixOS plutôt qu'Ansible](../decisions/ADR-016-NixOS-plutot-qu-Ansible-pour-Kazimierz.md) : la
  décision qui a remplacé la configuration Ansible.
