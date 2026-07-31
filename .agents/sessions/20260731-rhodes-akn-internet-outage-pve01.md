# rhodes.akn — perte totale d'accès internet, investigation pve-01

## Objectif

Diagnostiquer et corriger la perte totale d'accès internet depuis les pods/nodes de `rhodes.akn` (curl/ping vers une IP
publique ne reçoivent jamais de réponse, alors qu'aucun drop Cilium n'est observé). Investigation confirmée jusqu'ici
côté cluster (voir conversation) : le masquerade BPF fonctionne (paquet correctement SNAT vers l'IP du node avant de
sortir par `eth1`), le ping vers la gateway `10.128.0.1` (pve-01) répond, mais rien au-delà. Hypothèse principale : le
SNAT général du VNet SDN `talosnet` (`10.128.0.0/24` → internet) sur `pve-01`, déclaré (`snat: true` dans
`projects/chezmoi.sh/src/infrastructure/pulumi/stack/proxmox/sdn.ts:36`) mais déjà noté comme non appliqué en pratique
dans `docs/procedures/infrastructure/INF-20260730-00.pve-firewall-conntrack-notrack-external-lb.md` (trouvaille du
30/07, jamais corrigée), aurait été perdu suite à un `ifreload -a` déclenché ce même jour pour vérifier la règle NOTRACK
ajoutée par les commits `a01e2eed6`/`4635c4ad0`.

## Contexte & réflexions

- Accès demandé : `ssh root@pve-01.pve.chezmoi.sh`, machine de production (hôte Proxmox unique du homelab).
- Contrainte utilisateur explicite : documenter **toutes** les commandes lancées sur pve-01, **avant** de les lancer.
- Posture : diagnostic en lecture seule d'abord. Toute commande mutative (reload SDN, ajout de règle iptables/nat,
  `pvesh set ... --apply`) sera proposée et confirmée avant exécution — hôte de prod, single point of failure du
  homelab, aucun filet de sécu (`--no-verify` interdit, pas de rollback automatique).

## Change history

- _2026-07-31_: Création du document. Tentative de connexion SSH root@pve-01.

## Attention points

- `pve-01` est mono-nœud : un mauvais reload réseau peut couper l'accès SSH lui-même (risque déjà documenté dans
  INF-20260730-00 pour le NOTRACK, s'applique aussi ici).
- Ne pas confondre la règle NOTRACK (`10.0.0.64/26`, scope LB pool, probablement pas la cause directe) avec le SNAT
  général du VNet `talosnet` (`10.128.0.0/24`, cause suspectée réelle) — deux mécanismes distincts dans des tables
  iptables différentes (`raw` vs `nat`).

## Commands log

- [x] `ssh -o ConnectTimeout=5 root@pve-01.pve.chezmoi.sh 'hostname; whoami; pveversion'` — test de connectivité SSH,
      lecture seule. **Résultat** : OK, `pve-01`, root, PVE 9.2.5.

- [x] `ssh root@pve-01.pve.chezmoi.sh 'iptables -t nat -L POSTROUTING -n -v --line-numbers'` — **Résultat : chaîne
      totalement vide (0 règle).** Aucun MASQUERADE/SNAT nulle part sur pve-01.
- [x] `ssh root@pve-01.pve.chezmoi.sh 'iptables -t raw -L PREROUTING -n -v --line-numbers'` — **Résultat** : exactement
      2 règles NOTRACK pour `10.0.0.64/26` (conformes à INF-20260730-00, scope correct, pas de sur-largeur). Le reste
      (règles 3-10) ce sont les `CT zone 1` par guest `fwbr+`, sans rapport. **La règle NOTRACK est innocentée.**
- [x] `ssh root@pve-01.pve.chezmoi.sh 'pvesh get /cluster/sdn/vnets/talosnet/subnets --output-format json'` —
      **Résultat** : le JSON du subnet `talosnet` (`10.128.0.0/24`) n'a **aucune clé `snat`** — alors que `sdn.ts:36`
      déclare `snat: true` côté Pulumi. Confirme le drift déjà noté dans INF-20260730-00, jamais corrigé.
- [x] `ssh root@pve-01.pve.chezmoi.sh 'ip route; ip addr show vmbr0'` — **Résultat** : `default via 10.0.0.1 dev vmbr0`,
      `talosnet` (10.128.0.0/24) routé localement vers `vmbr0` (10.0.0.0/22) sans aucune traduction. Le trafic sort donc
      avec une source IP privée (`10.128.0.x`) jamais NAT'ée, indistinguable d'un trou noir pour tout retour depuis
      l'extérieur.

**CONCLUSION** : cause racine confirmée à 100 % — le SNAT du VNet SDN `talosnet` n'a jamais été (ou plus est) appliqué
côté PVE live, malgré sa déclaration Pulumi. La règle NOTRACK ajoutée le 30/07 est innocentée (scope exact, non
impliquée). Fix proposé : réappliquer l'attribut `snat` sur le subnet PVE puis déclencher l'apply SDN.

**GO utilisateur reçu à 2026-07-31 pour exécuter le fix.** Commandes prévues, dans l'ordre :

- [ ] `ssh root@pve-01.pve.chezmoi.sh 'pvesh set /cluster/sdn/vnets/talosnet/subnets/pvenet-10.128.0.0-24 --snat 1'` —
      ajoute l'attribut `snat` manquant sur le subnet PVE (déclaratif seulement, pas encore appliqué au runtime).
- [x] `ssh root@pve-01.pve.chezmoi.sh 'pvesh set /cluster/sdn/vnets/talosnet/subnets/pvenet-10.128.0.0-24 --snat 1'` —
      **OK**, confirmé par un `get` derrière : `"snat":1` présent, digest changé.
- [x] `ssh root@pve-01.pve.chezmoi.sh 'pvesh set /cluster/sdn --apply'` — **échec** : `Unknown option: apply` (mauvaise
      syntaxe API, `--apply` n'est pas une option de `pvesh set`). Correction en cours : `pvesh set /cluster/sdn` (PUT
      sans paramètre est lui-même l'action d'apply en PVE 9).
- [x] `ssh root@pve-01.pve.chezmoi.sh 'pvesh set /cluster/sdn'` — **OK**. `pve-01: reloading network config`, UPID
      retourné, pas d'erreur. Session SSH survit au reload.
- [x] `ssh -o ConnectTimeout=5 root@pve-01.pve.chezmoi.sh 'iptables -t nat -L POSTROUTING -n -v --line-numbers'` —
      **Règle SNAT présente** : `10.128.0.0/24 -> SNAT to:10.0.0.11` sur `vmbr0`. Le fix a pris effet.
- [x] Validation finale : `ping` depuis `netshoot-host` (host netns) vers `142.251.39.99` → 3/3 reçus, ttl=115, ~2.65ms.
      `curl` depuis `netshoot` (pod network) → handshake TLS complet (échec attendu ensuite sur SNI/cert, cible une IP
      brute sans nom d'hôte — non lié à la connectivité). **Internet rétabli, confirmé bout en bout.**

## Vérification post-fix : dérive Pulumi

- [x] `pulumi preview --refresh --diff` (full stack) — **échec, sans rapport avec le sujet** : le stack
      `chezmoi_sh.live` gère aussi TrueNAS (SMB, datasets, cron, apps...) et le refresh complet sature son API
      (`truenas rpc error -32000: Maximum number of concurrent calls (20) has exceeded`), preview avorté avant même
      d'atteindre la ressource SDN. Aucune donnée exploitable sur `talosnetSubnet`.
- [x] `pulumi stack export | grep talosnet` — récupération de l'URN exact de la ressource :
      `urn:pulumi:chezmoi_sh.live::chezmoi-sh-infra::proxmox:index/sdnSubnet:SdnSubnet::pve-sdn-subnet-talosnet`
- [x] `pulumi preview --refresh --diff --target urn:...SdnSubnet::pve-sdn-subnet-talosnet --target-dependents` —
      **Résultat : `152 unchanged`, aucune diff.** L'état live (`snat: 1`, appliqué manuellement) correspond exactement
      à l'état déclaré (`snat: true`, `sdn.ts:36`). **Aucune dérive** — un futur `pulumi up` sur ce stack ne modifiera
      pas cette ressource. Le point ouvert précédent ("écart avec l'IaC à traiter") est clos : rien à faire de plus, le
      fix live est déjà cohérent avec le code.

## Ménage post-migration : suppression de `ingress-gateway-system`

Suite à l'audit complet (`kubectl api-resources` sur les 129 types), seul orphelin trouvé : le namespace
`ingress-gateway-system`, disparu de `dist/` depuis le refactor "fold ingress-gateway into cilium" (845b719ea) mais
toujours vivant en parallèle de `kube-system`, avec les `HTTPRoute` pocket-id/openbao encore pointées dessus.

- [x] Test : repointage des `HTTPRoute` pocket-id/openbao vers `kube-system` (déjà la source git) **sans** créer de
      `ReferenceGrant` — `ResolvedRefs: True` sur les deux, puis confirmé par trafic réel (`curl` via `netshoot-test`) :
      `auth.chezmoi.sh` → 200, `vault.chezmoi.sh` → 307 (redirect normal). **Conclusion : les ReferenceGrant ne sont pas
      requis** par cette version de Cilium pour ce schéma (Gateway et Service same-ns route, seul le Gateway est dans un
      autre namespace).
- [x] Suppression de `security/reference-grant.ingress-gateway.yaml` + son entrée dans `security/kustomization.yaml`
      côté `src/apps/pocket-id/`, `dist:render` relancé (le fichier dist correspondant disparaît).
- [x] `kubectl delete referencegrant ingress-gateway-system-to-pocket-id -n pocket-id` et
      `ingress-gateway-system-to-openbao-ui -n vault` — trafic revérifié après coup, toujours 200/307.
- [x] `kubectl delete namespace ingress-gateway-system` — cascade propre (Services, Gateways, HTTPRoutes,
      CiliumNetworkPolicies, Certificate/CertificateRequest/Order, Secret). Trafic revérifié une dernière fois :
      200/307.
- [x] Pod de test `netshoot-test` supprimé.

**État final** : un seul jeu de Gateway (`kube-system/{external,internal}`), aucun `ReferenceGrant` sur le cluster,
aucune trace de `ingress-gateway-system`.

## Bug LB-IPAM : pool `external` sans exclusion du label `internal`

Confirmé via logs `cilium-operator` :
`Assigning Ingress IP serviceName=kube-system/cilium-gateway-internal ipAddr=10.0.0.66` alors que le pool `internal`
avait une IP libre. Cause : `external.ippool.yaml` n'avait pas de `serviceSelector`, donc matchait aussi les Services
labellisés `internal`, avec un tie-break non déterministe côté Cilium. `amiya.akn`/`lungmen.akn` non affectés (un seul
pool chacun) — pattern spécifique à `rhodes.akn` (split external/internal dual-NIC), mais à corriger comme référence
pour de futurs clusters similaires.

- [x] Fix appliqué dans `src/infrastructure/kubernetes/cilium/external.ippool.yaml` : ajout d'un `serviceSelector`
      `NotIn [internal]`, correction du commentaire (8 IPs allouables sur le /29, pas 6).
- [x] `dist:render projects/rhodes.akn/src/infrastructure/kubernetes/cilium` — régénéré,
      `CiliumLoadBalancerIPPool.external.yaml` modifié dans `dist/`.
- [x] `kubectl apply --server-side -f dist/.../cilium.io.v2alpha1.CiliumLoadBalancerIPPool.external.yaml` — appliqué,
      `serviceSelector NotIn [internal]` confirmé en live.
- [x] `kubectl delete svc cilium-gateway-internal -n kube-system` — recréé automatiquement en quelques secondes par le
      contrôleur Gateway API, avec la bonne IP cette fois : `10.128.0.240` (pool `internal`).
- [x] Vérification finale : `external` → `10.0.0.65` (Programmed: True), `internal` → `10.128.0.240` (Programmed: True),
      pools `external: 7 available` / `internal: 1 available` (cohérent, 1 IP utilisée par le Gateway internal). Trafic
      : `auth.chezmoi.sh` → 200, `vault.chezmoi.sh` (via IP interne) → 307. **Bug corrigé et vérifié.**

## Doc IPAM mise à jour

`docs/network/ipam.md` corrigé pour cohérence avec le fix LB-IPAM (l'utilisateur a remarqué le passage de 6 à 8 IPs
utilisables dans le commentaire de `external.ippool.yaml` et a demandé la répercussion) :

- Table VLAN 5 (`10.0.0.64/26`) : `.65–.126` / "6 usable IPs each" → `.64–.127` / "8 usable IPs each".
- Section "Cilium LoadBalancer Pools" : description corrigée pour expliquer que l'exclusivité de `internal` dépend d'une
  exclusion explicite côté `external`, pas juste du `serviceSelector` d'`internal` — reprend le bug trouvé plus haut
  dans la session.
- Table des 8 blocs `/29` : chaque plage recalculée pour inclure l'adresse "réseau" du bloc (ex. `.65–.70` → `.64–.71`
  pour rhodes.akn).
- Section "Internal LoadBalancer Pools" : phrase "internal... never competes with external as a second catch-all"
  corrigée — c'était vrai seulement après le fix, pas par la seule vertu du `serviceSelector` d'`internal`.

## Bilan de session

Trois sujets traités ce jour sur `rhodes.akn` :

1. Panne internet totale → SNAT manquant sur le VNet SDN `talosnet` (pve-01) → corrigé (`snat: 1` appliqué), confirmé
   sans dérive Pulumi.
2. Ménage `ingress-gateway-system` (orphelin post-refactor "fold ingress-gateway into cilium") → supprimé, ainsi que les
   `ReferenceGrant` associés (confirmés inutiles par test de trafic réel avant suppression).
3. Bug LB-IPAM (pool `external` sans exclusion du label `internal`) → corrigé dans la source, régénéré, appliqué,
   Service internal recréé avec la bonne IP.

Rien de connu ne reste en suspens sur ces trois sujets. Fichiers modifiés dans le repo :

- `projects/rhodes.akn/src/apps/pocket-id/security/kustomization.yaml` (retrait reference-grant)
- `projects/rhodes.akn/src/apps/pocket-id/security/reference-grant.ingress-gateway.yaml` (supprimé)
- `projects/rhodes.akn/src/infrastructure/kubernetes/cilium/external.ippool.yaml` (serviceSelector ajouté)
- `dist/` régénéré en conséquence pour les deux
- `projects/rhodes.akn/src/infrastructure/pulumi/Pulumi.rhodes_akn.live.yaml` (déjà modifié avant cette session,
  `recovery: false`, toujours non commité)

## Résolution

Cause racine : le VNet SDN `talosnet` (`10.128.0.0/24`) avait perdu son attribut `snat` côté PVE live (absent du
`pvesh get`, malgré `snat: true` déclaré dans `sdn.ts:36`) — plus aucun SNAT/MASQUERADE n'existait dans
`iptables -t nat -L POSTROUTING` (chaîne vide), donc tout paquet sortant de `talosnet` gardait sa source IP privée,
jamais routable en retour depuis l'internet public. La règle NOTRACK ajoutée le 30/07 (`10.0.0.64/26`) a été vérifiée et
innocentée (scope exact, aucun rapport).

Fix appliqué et vérifié :

1. `pvesh set /cluster/sdn/vnets/talosnet/subnets/pvenet-10.128.0.0-24 --snat 1`
2. `pvesh set /cluster/sdn` (syntaxe correcte pour déclencher l'apply/reload réseau — `--apply` n'existe pas comme
   option de `pvesh set`)
3. Règle `SNAT 10.128.0.0/24 -> to:10.0.0.11` confirmée présente dans `iptables -t nat -L POSTROUTING`
4. Connectivité internet confirmée bout en bout depuis rhodes.akn (ping + TLS handshake)

**Écart avec l'IaC — clos.** Vérifié via `pulumi preview --refresh --target` scopé sur `pve-sdn-subnet-talosnet` :
`152 unchanged`, aucune diff. Le provider `@pulumi/proxmox` gère bien l'attribut `snat`, et l'état live (`snat: 1`)
correspond exactement à l'état déclaré (`snat: true`). Un futur `pulumi up` sur le stack `chezmoi.sh` ne touchera pas à
cette ressource. Rien à corriger côté IaC.

- [ ] `ssh root@pve-01.pve.chezmoi.sh 'iptables -t nat -L POSTROUTING -n -v --line-numbers'` — vérifier qu'une règle
      MASQUERADE pour `10.128.0.0/24` est bien apparue.
- [ ] Depuis le cluster rhodes.akn (pod `netshoot-host` déjà déployé dans `kube-system`) : re-tester `curl`/`ping` vers
      une IP internet réelle pour confirmer le rétablissement.

## Next steps

- [ ] Confirmer l'accès SSH root@pve-01
- [ ] Vérifier l'état live de `iptables -t nat -L POSTROUTING`
- [ ] Vérifier la config SDN déclarée (`pvesh get /cluster/sdn/vnets/talosnet/subnets`)
- [ ] Vérifier les règles NOTRACK existantes (`iptables -t raw -L PREROUTING`) pour écarter une erreur de scope
- [ ] Si SNAT manquant confirmé : proposer le fix (réapplication SDN ou règle manuelle), confirmer avant d'exécuter
- [ ] Revalider depuis le cluster (curl/ping internet) après fix
