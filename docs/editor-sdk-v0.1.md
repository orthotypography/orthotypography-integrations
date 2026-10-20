# SDK pour éditeurs de documents : contrat neutre

Le paquet `packages/editor-sdk`, publié sous le nom
`@orthotypography/editor-sdk` (version `0.3.0-alpha.0` au 20 octobre 2026),
appartient aux intégrations. Le cœur reste indépendant de Word, Google Docs,
ONLYOFFICE et LibreOffice. Ce document décrit le point d'entrée neutre `.`, seul
point d'entrée du paquet sur `main`, qui ne contient aucune API propre à ces
éditeurs. Les versions publiées jusqu'à `0.2.0-alpha.0` comprenaient aussi un
point d'entrée `./google-docs`, retiré depuis.

## Contrat

`prepareDocumentPlan(snapshot, rules, { dismissed })` copie et fige
l'instantané, puis analyse chaque suite logique séparément en une seule passe
`review` du cœur : toutes les règles proposent leurs corrections, et le mode par
défaut de chaque règle devient l'indication `suggested` de ses propositions
(`apply` ou `review`) et de leurs groupes (vrai si toutes leurs propositions
sont suggérées). Le plan expose, par suite, les diagnostics sources reliés à
leurs changements (`groupId`, `changeIds`), les groupes de propositions, les
changements de tous les groupes et la prévisualisation qui les applique tous.
Les offsets restent exprimés en unités UTF-16 dans chaque nœud source. Le plan
est un type nominal opaque. Un identifiant de nœud est unique dans sa suite ; un
identifiant de suite est unique dans le document.

Un groupe est l'unité d'acceptation : ses changements s'appliquent ensemble, et
toute réunion de groupes d'un même plan s'applique sans conflit. Un groupe dont
les propositions s'annulent n'a aucun changement ; l'hôte peut présenter ses
diagnostics comme contradictoires.

`validateDocumentPlan(plan, currentSnapshot, accepted)` compare l'identité du
document, sa révision et l'intégralité du contexte extrait. Il reçoit les
groupes acceptés, sous la forme des objets originaux du plan, en entier et une
seule fois chacun ; un groupe copié, reconstruit ou issu d'un autre plan est
refusé. Il vérifie à nouveau les changements de ces groupes avec
`applyTextChanges`, puis retourne le lot correspondant, qui expose les groupes
acceptés et, par suite modifiée, les nœuds obtenus. Il n'écrit jamais dans
l'éditeur. Une acceptation partielle porte donc sur des groupes entiers du plan
courant, jamais sur des changements isolés. Un plan n'est accepté que s'il
provient de la même instance du module ; le lot validé possède la même opacité
nominale. La sérialisation est exclue de cette API.

Une correction écartée par l'utilisateur est transmise au plan suivant par
l'option `dismissed`, désignée par sa suite, sa règle et la plage source que le
plan précédent a rapportée. Le cœur recalcule la cascade sans elle et la
rapporte avec `dismissed: true`, sans groupe. L'application cliente conserve ces
corrections écartées et met leurs plages à jour quand le document change ; une
suite inconnue est refusée. Après chaque acceptation, l'application relance la
préparation sur le document mis à jour, car la contiguïté ne détecte pas les
dépendances lointaines entre règles (§ 7.2 de la conception du cœur).

La vérification de `expected` seule ne suffit pas : un mot voisin peut avoir
changé sans modifier la sous-chaîne visée. La comparaison complète couvre aussi
les identifiants, l'ordre, la langue et les protections, y compris les suites
sans correction. Les métadonnées natives non extraites, notamment les styles,
doivent être couvertes par la révision fournie par l'adaptateur.

## Application native

Le lot des groupes acceptés constitue une transaction indivisible, y compris
lorsqu'une correction porte sur plusieurs nœuds. Les changements sont triés par
indice de segment puis par position décroissants dans chaque suite. L'adaptateur
construit les plages natives et détermine l'ordre global éventuellement
nécessaire entre suites.

L'adaptateur doit vérifier la révision à l'intérieur de l'opération atomique
native, préserver les styles et garantir l'annulation de l'ensemble en cas de
conflit ou d'échec d'écriture. Une validation JavaScript préalable n'empêche pas
une modification concurrente entre lecture et écriture. Si l'hôte ne fournit pas
de mécanisme équivalent, limiter l'intégration à l'analyse et à la
prévisualisation tant que cette garantie n'est pas résolue.

## Versionnement et adaptateur de référence

La configuration autonome du SDK épingle sa propre version du cœur, publiée
(`0.2.0-alpha.0` au 19 octobre 2026) ou, pendant la préparation d'une ligne du
cœur, un commit immuable documenté dans la feuille de route ; dans ce dernier
cas, le SDK ne peut être ni empaqueté ni publié. Deno sert uniquement au
développement ; le code de production utilise des fonctions JavaScript standard.

L'adaptateur de référence `createMemoryDocument` expose `read`, `commit` et
`replaceRuns`. Il accepte uniquement les lots originaux du module, revalide le
plan et ses groupes acceptés lors du commit et prépare toutes les suites avant
un remplacement synchrone de l'état. Les instantanés sont figés ; une erreur ne
produit aucune écriture partielle. Un lot vide conserve la révision mais reste
soumis aux contrôles.

`replaceRuns` simule les éditions concurrentes avec contrôle de révision. Chaque
remplacement réussi avance la révision, même si le texte initial est rétabli.
Ces révisions sont opaques et propres à la durée de vie d'une instance. Cette
référence ne modélise ni les styles natifs, ni la sélection, ni l'historique
d'annulation, ni la coordination entre processus.

Le point d'entrée `mod.ts` (`.`) porte l'intégralité du contrat neutre et reste
en version alpha. Un adaptateur d'éditeur dépend de ce point d'entrée public et
garde hors du paquet les plages natives, les styles, les transports et les
identifiants propres à son fournisseur.

La [décision de paquetage](./editor-sdk-packaging-v0.1.md) retient un paquet
`@orthotypography/editor-sdk` indépendant du groupe de versions Astro. Un
workflow distinct applique son propre tag de release et sa reprise partielle
sans modifier les versions des adaptateurs.
