# Structure Pulumi Fleet Reference

Convention cible des projets Pulumi du dépôt : où ranger une ressource, à quoi ressemble un projet, et comment repérer
ce qui sort d'une stack. Une personne qui connaît l'infrastructure sans connaître Pulumi y trouve le vocabulaire en
tête, puis les règles de structure, les règles de code et les sorties. Les opérations sur l'état (déplacer, importer une
ressource) sont dans
[Gérer l'état Pulumi et importer des ressources](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md).

## Vocabulaire Pulumi

Pulumi décrit l'infrastructure dans un programme (ici TypeScript). `pulumi preview` compare ce programme à l'état connu
et affiche la différence ; `pulumi up` l'applique.

| Terme            | Sens dans ce dépôt                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack            | Une instance déployée du programme, liée à une cible (un cluster ou un hôte), avec sa configuration et son état. Chaque cible a une seule stack.       |
| Projet           | Le dossier `pulumi/` qui contient un `Pulumi.yaml` : le programme et ses dépendances. Pulumi exige son nom, qui entre dans le nom complet de la stack. |
| État, backend    | L'état est la liste des ressources que Pulumi a créées. Il vit dans le backend : le bucket S3 `pulumi-states` de Garage.                               |
| Configuration    | Les valeurs d'entrée de la stack, dans `Pulumi.<stack>.yaml`, posées par `pulumi config set`. Les secrets y sont chiffrés.                             |
| Provider         | Le plugin qui parle à une API : OCI, Cloudflare, Proxmox, OpenBao, Pocket-Id, Kubernetes…                                                              |
| Composant        | Une ressource qui en regroupe d'autres (`ComponentResource`). Les composants partagés vivent dans `catalog/pulumi/components/`.                        |
| Output (sortie)  | Une valeur que la stack rend disponible hors d'elle. Voir [Sorties d'une stack](#sorties-dune-stack).                                                  |
| `StackReference` | La lecture, par une stack, des exports d'une autre stack, désignée par son nom complet `organization/<projet>/<stack>`.                                |

## Structure d'un projet

### Un projet, une stack, une cible

Chaque cible de `fleet/` porte au plus un projet Pulumi, dans son dossier `pulumi/` :

| Cible                             | Dossier                               | Projet (`name` de `Pulumi.yaml`) | Stack                  |
| --------------------------------- | ------------------------------------- | -------------------------------- | ---------------------- |
| Cluster `<nom>.akn`               | `fleet/clusters/akn.<nom>/pulumi/`    | `<nom>-akn`                      | `<nom>_akn.live`       |
| Hôte `<nom>.<famille>`            | `fleet/hosts/<famille>.<nom>/pulumi/` | `<nom>-<famille>`                | `<nom>_<famille>.live` |
| Ressources liées à aucune machine | `fleet/base/pulumi/`                  | `base`                           | `base.live`            |

Le projet n'a qu'une stack, `.live` : il n'existe pas d'environnement de test. Son nom complet, celui qu'attend un
`StackReference`, est `organization/<projet>/<stack>`, par exemple `organization/horn-akn/horn_akn.live`. Les noms des
cibles suivent [Nommage des machines](Nommage-des-Machines-Reference.md).

Tous les projets partagent la même base :

- runtime `nodejs`, dépendances gérées par `pnpm` dans l'espace de travail de la racine (`pnpm-workspace.yaml`) ;
- backend d'état déclaré dans `Pulumi.yaml` : `s3://pulumi-states?endpoint=s3.chezmoi.sh&region=fr-par-1` ;
- secrets lus par fnox depuis Bitwarden Secrets Manager. `fleet/.mise.toml` remplace `pulumi` par `fnox exec -- pulumi`
  dans les shells interactifs ; `fleet/.fnox.toml` fournit les secrets communs (identifiants du backend, phrase secrète
  partagée par toutes les stacks), le `.fnox.toml` de la cible ceux de ses providers. Le fonctionnement est décrit dans
  [Cadre technique et conventions](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md#cadre-technique-et-conventions)
  et l'accès à Bitwarden dans le [README du dépôt](../../README.md#bitwarden-secrets-manager-access-macos). Aucun secret
  n'est versionné en clair.

### Fichiers d'un projet

| Fichier               | Contenu                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pulumi.yaml`         | Nom du projet, runtime, backend d'état.                                                                                                                                                               |
| `Pulumi.<stack>.yaml` | Configuration de la stack, secrets chiffrés. Jamais recopié dans une page.                                                                                                                            |
| `.mise.toml`          | `PULUMI_STACK=<stack>` et, **cible**, les tâches `pulumi:diff` et `pulumi:apply` (`scripts/pulumi:stack preview` et `up`). Aujourd'hui seuls `base`, `core.nas`, `core.pbs` et `core.pve-01` les ont. |
| `package.json`        | Dépendances : `workspace:*` pour les paquets internes de `catalog/pulumi/`, `catalog:` pour les versions de `pnpm-workspace.yaml`.                                                                    |
| `tsconfig.json`       | Configuration TypeScript.                                                                                                                                                                             |
| `index.ts`            | Point d'entrée du programme. Son rôle dépend de la forme du projet.                                                                                                                                   |
| `stack/`              | Forme complexe seulement : le programme, rangé par thème.                                                                                                                                             |

### Forme simple

Toutes les ressources relèvent d'un seul sujet, quelques ressources au plus : le programme tient dans `index.ts`, sans
dossier `stack/`. Exemple, `fleet/hosts/core.omni/pulumi/`, qui crée un jeton DNS-01 Cloudflare et l'écrit dans un
fichier SOPS lu par NixOS :

```text
fleet/hosts/core.omni/pulumi/
├── .mise.toml
├── package.json
├── Pulumi.yaml
├── Pulumi.<stack>.yaml
├── tsconfig.json
└── index.ts                 # configuration, ressources, exports
```

### Forme complexe

Dès qu'un deuxième sujet apparaît, le projet passe en forme complexe : `index.ts` ne contient plus que des `import`
(importer un module crée ses ressources), les exports et les fichiers SOPS (voir
[Sorties d'une stack](#sorties-dune-stack)), et le programme vit dans `stack/`, rangé par thème. Exemple,
`fleet/hosts/akn.horn/pulumi/` aligné sur la cible :

```text
fleet/hosts/akn.horn/pulumi/
├── .mise.toml
├── package.json
├── Pulumi.yaml
├── Pulumi.<stack>.yaml
├── tsconfig.json
├── index.ts                 # imports des thèmes, puis les exports
└── stack/
    ├── config.ts            # toutes les entrées du programme
    ├── platform/            # oci-compartment.ts, network.ts, instance.ts
    ├── system/              # acme.ts (jeton DNS-01 de Traefik)
    ├── access/              # dns.ts, oidc.ts, tailscale.ts
    └── apps/
        └── pangolin/        # idp.ts, org.ts, role.ts
```

## Thèmes du dossier `stack/`

La liste est fermée : un dossier de premier niveau de `stack/` est l'un des cinq thèmes ci-dessous. Un fichier traite un
sujet, porte le nom de ce qu'il crée, en minuscules avec des tirets (`oci-compartment.ts`, `oidc.ts`). Un sous-dossier
n'apparaît que pour une série d'éléments du même type (`access/users/<compte>.ts`, `apps/<app>/`).

| Thème         | Ce qui y va                                                                                                                                                                 | Fichiers types                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `platform/`   | Ce qui fait exister la machine, hors d'elle : compartiment cloud, instance, réseau cloud où elle vit                                                                        | `oci-compartment.ts`, `instance.ts`, `network.ts`                     |
| `system/`     | La configuration de la machine elle-même : réseau propre, pare-feu, services, certificats ACME, alertes, tâches. Dans un cluster, un fichier par composant d'infrastructure | `network.ts`, `firewall.ts`, `acme.ts`, `alerts.ts`, `<composant>.ts` |
| `storage/`    | Tout ce qui touche à la donnée : pools, datasets, partages, datastores, leurs tâches de maintenance et les sauvegardes vers l'extérieur                                     | `pools.ts`, `shares.ts`, `datastore.ts`, `backup-<destination>.ts`    |
| `access/`     | Qui atteint la machine et avec quoi : enregistrements DNS, comptes, ACL, jetons d'API remis à d'autres, client OIDC, Tailscale, groupes                                     | `dns.ts`, `users/`, `acls.ts`, `oidc.ts`, `tailscale.ts`              |
| `apps/<app>/` | Tout ce dont une application hébergée par la cible a besoin : client OIDC, route publique, stockage, secrets                                                                | `oidc.ts`, `pangolin.ts`, `storage.ts`                                |

À la racine de `stack/`, seul `config.ts` est admis.

> [!NOTE]\
> `system/` et `storage/` sont séparés parce que la donnée est la seule chose qu'on ne peut pas reconstruire. Une
> machine se recrée depuis le code, une configuration se réapplique ; un pool, un dataset ou une sauvegarde, non. Isoler
> leur définition dans `storage/` signale, à la relecture d'un plan, les changements qui touchent à la donnée et doivent
> être relus avec le plus de soin.

Cas ambigus tranchés :

| Sujet                         | Place                                                                                                                                                                       | Raison                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Enregistrement DNS            | `access/dns.ts`                                                                                                                                                             | Un enregistrement est l'adresse par laquelle on atteint la machine ; c'est déjà sa place partout où il existe. |
| Réseau                        | `platform/network.ts` si la stack crée le réseau où vit la machine (VCN OCI), `system/network.ts` (ou `sdn.ts`, `firewall.ts`) si elle configure le réseau de la machine    | Même frontière que pour le reste : hors de la machine ou dans la machine.                                      |
| Jeton DNS-01, certificat ACME | `system/acme.ts`                                                                                                                                                            | Le certificat sert la machine elle-même ; `acme.ts` est le nom déjà le plus employé.                           |
| Client OIDC (Pocket-Id)       | `oidc.ts`, dans `access/` pour la machine, dans `apps/<app>/` pour une application                                                                                          | `oidc.ts` est le nom de loin le plus répandu (clusters) ; le fichier suit ce qu'il protège.                    |
| Groupes Pocket-Id partagés    | `access/groups.ts` de `base`                                                                                                                                                | Ils disent qui accède à quoi : pas besoin d'un thème `identity/` pour un seul projet.                          |
| Pangolin                      | `apps/<app>/pangolin.ts` pour la route publique d'une application, `system/pangolin.ts` pour le site Newt d'un cluster, `apps/pangolin/` pour l'instance Pangolin elle-même | Pangolin est une application de `horn.akn` ; ailleurs, il expose une application ou relie le cluster.          |
| Notifications                 | `system/alerts.ts`                                                                                                                                                          | Où la machine signale ses problèmes : une configuration de la machine, pas un thème à part.                    |

## Règles de code

- **`index.ts`** : en forme complexe, des `import` de modules, les exports et les `SopsFile` (un `SopsFile` est un
  export sécurisé et réutilisable), rien d'autre. En forme simple, tout le programme, exports à la fin.
- **Entrées** : la configuration (`new pulumi.Config()`) est lue à un seul endroit, `stack/config.ts` en forme complexe,
  le haut de `index.ts` en forme simple. Les autres fichiers importent ce dont ils ont besoin depuis `config.ts`.
- **Composants** : un composant partagé vient de `catalog/pulumi/components/`, déclaré en `workspace:*` dans le
  `package.json` du projet. La liste et le rôle de chacun sont dans le
  [README des composants](../../catalog/pulumi/components/README.md).
- **Lecture d'une autre stack** : par `StackReference`, jamais par un fichier ni un secret intermédiaire. Toutes les
  stacks partagent la phrase secrète de `fleet/.fnox.toml`, donc un export secret reste lisible.
- **Secret OpenBao** : toujours créé avec `vaultSecretMetadata()` (`@chezmoi.sh/pulumi-lib`). Ce composant ajoute
  automatiquement les métadonnées qui permettent de retrouver la source du secret : le fichier qui l'a créé
  (`created-by`) et la cible propriétaire (`owner`).

## Phases de déploiement

Certaines ressources ne peuvent exister qu'une fois d'autres en place, ou doivent être sautées tant qu'elles ne le sont
pas. Exemple, `horn.akn` : enveloppe OCI, puis installation de la VM, puis configuration de Pangolin, qui passe par
l'API de la VM. Une stack reste unique : une phase est un interrupteur de configuration, pas une seconde stack.

Format commun, en trois éléments :

1. **Une clé de configuration booléenne**, nommée d'après la phase (`pangolin`), lue dans `stack/config.ts` et exposée
   par une variable `with<Phase>` (`withPangolin`).
2. **Une valeur par défaut à `true`**, car désactiver une phase sur une stack qui contient déjà ses ressources les
   supprime. On ne passe à `false` que pour le premier déploiement.
3. **Une condition dans `index.ts`**, jamais dans les fichiers de thème, pour que `index.ts` montre ce qui dépend de
   quoi :

```ts
import { withPangolin } from "./stack/config";

if (withPangolin) {
  require("./stack/apps/pangolin/idp");
}
```

Déroulement : `pulumi config set pangolin false`, premier `pulumi up`, installation de l'hôte, puis
`pulumi config rm pangolin` et second `pulumi up`. Le drapeau `recovery` de `rhodes.akn` fonctionne à l'inverse (`true`
saute des fichiers) et sa condition est dans un fichier de thème : il est à aligner sur ce format.

## Sorties d'une stack

Un output est une donnée qui sort de la stack. Il en existe trois sortes générales, plus un cas d'exception :

| Sorte               | Déclaration dans le code      | Lecteur                                                             |
| ------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Export Pulumi       | `export` dans `index.ts`      | `pulumi stack output` ou un `StackReference`                        |
| Fichier SOPS        | `new SopsFile(...)`           | NixOS, qui déchiffre `nix/secrets/*.sops.json` de la cible          |
| Secret OpenBao      | `new vault.kv.SecretV2(...)`  | External Secrets Operator, qui peut en faire un `Secret` Kubernetes |
| `Secret` Kubernetes | `new k8s.core.v1.Secret(...)` | Exception propre à `rhodes.akn`, voir l'encadré ci-dessous          |

Pulumi ne publie que les exports du point d'entrée : un `export const` dans un fichier de `stack/` est un export de
module TypeScript, pas un output, tant qu'`index.ts` ne le réexporte pas.

Règles :

- **Exports** : uniquement dans `index.ts`, après les imports, chacun précédé d'un commentaire qui nomme son lecteur.
  Une valeur que personne ne lit n'est pas exportée. `index.ts` sert ainsi de fichier dédié aux exports.
- **Fichiers SOPS** : déclarés dans `index.ts`, à côté des exports. Un `SopsFile` est un export sécurisé et réutilisable
  : il exploite les valeurs exportées par la stack et les remet, chiffrées, à un lecteur extérieur (NixOS). Les déclarer
  à la racine rend l'audit des sorties immédiat.
- **Secrets OpenBao et Kubernetes** : la ressource reste dans le fichier de son sujet. Un composant n'écrit jamais de
  secret à la place du projet.
- **Inventaire** : rien n'est généré ni écrit automatiquement. `mise run pulumi:outputs`, lancé depuis le dossier
  `pulumi/` d'un projet (la tâche n'est visible que dans ces dossiers), lit l'état de la stack (`pulumi stack export`)
  et affiche un tableau : nom, sorte, destination. Il ne lit aucune valeur de secret et n'écrit aucun fichier.

Les règles sur les exports et les fichiers SOPS rendent le repérage mécanique, depuis le dossier `pulumi/` du projet :

```sh
grep -n '^export' index.ts
grep -rnE 'new SopsFile|kv\.SecretV2|core\.v1\.Secret\(' index.ts stack/
```

Ces `grep` lisent le code (avant déploiement), `mise run pulumi:outputs` lit l'état (après).

> [!WARNING]\
> **Ne pas utiliser le provider Kubernetes** : il ajoute une complexité importante (kubeconfig, `pulumi preview` qui
> doit joindre le cluster, plan de l'infrastructure lié à la santé de ce qu'elle porte). Un secret destiné à un cluster
> va dans OpenBao, sous le montage du cluster ; une valeur passée d'une stack à une autre passe par un `StackReference`.
>
> Seule exception, propre à `rhodes.akn` : OpenBao tourne sur ce cluster (l'œuf et la poule), donc ce qui doit
> fonctionner avant lui ne peut pas en dépendre. Les `Secret` Kubernetes de `rhodes-akn` sont écrits avec un provider
> explicite (`k8s.Provider` et `kubeconfigFor()` de `@chezmoi.sh/pulumi-lib`), et chaque fichier explique en commentaire
> pourquoi il ne passe pas par OpenBao.

## Pour aller plus loin

- [Gérer l'état Pulumi et importer des ressources](../procedures/infrastructure/INF-20260705-00-Gerer-l-Etat-Pulumi-et-Importer-des-Ressources.md)
  : déplacer ou importer des ressources entre projets sans les recréer.
- [Architecture du dépôt](Architecture-du-Depot-Reference.md) : place du dossier `pulumi/` dans une cible de `fleet/`.
- [ADR-015 Migrer Crossplane vers Pulumi](../decisions/ADR-015-Migrer-Crossplane-vers-Pulumi.md) : pourquoi Pulumi est
  le seul outil d'infrastructure en tant que code.
- [Skill : bonnes pratiques Pulumi](../../.agents/skills/pulumi-best-practices/SKILL.md) : règles générales d'écriture
  d'un programme Pulumi.
