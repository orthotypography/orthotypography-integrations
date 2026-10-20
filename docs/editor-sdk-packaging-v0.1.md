# Paquetage du SDK pour éditeurs

**Statut :** décision adoptée et appliquée, puis révisée le 20 octobre 2026. Le
paquet a été publié en `0.1.0-alpha.0` (9 septembre 2026), `0.1.0-alpha.1` (26
septembre) et `0.2.0-alpha.0` (19 octobre) avec les deux points d'entrée
ci-dessous. La version `0.3.0-alpha.0`, publiée le 20 octobre, retire le point
d'entrée `./google-docs` : le paquet n'expose plus que `.`. Les sections
suivantes sont conservées comme historique de la décision.

## Révision du 20 octobre 2026

Le paquet ne contient plus d'adaptateur propre à un éditeur. Un adaptateur
dépend du point d'entrée public `@orthotypography/editor-sdk` et suit son propre
cycle de version, hors de ce paquet ; le contrat neutre, son adaptateur en
mémoire et ses contrôles de publication restent dans ce dépôt.

## Décision

Le SDK forme un seul paquet `@orthotypography/editor-sdk` avec deux points
d'entrée publics :

| Export                                    | Contenu                                                                    | Dépendances de production                   |
| ----------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `@orthotypography/editor-sdk`             | instantanés, plans, lots et adaptateur mémoire                             | `@orthotypography/core`                     |
| `@orthotypography/editor-sdk/google-docs` | extraction, prévisualisation, styles, transport, revue et REST Google Docs | `@orthotypography/core` et API Web standard |

Cette topologie conserve une version unique pour le contrat neutre et son
premier adaptateur, tout en empêchant l'import accidentel du code Google Docs
par un autre éditeur. Le sous-chemin Google Docs ne contient ni OAuth, ni
stockage d'identifiants, ni dépendance cliente Google. Une séparation en deux
paquets ne sera justifiée que si leurs cycles de version ou leurs dépendances
divergent réellement.

Le paquet n'entre pas dans le groupe de versions commun à `rehype`, `satteri` et
`astro`. Son évolution dépend du contrat d'éditeur et du cœur, non des versions
d'Astro. Sa première version a donc été `0.1.0-alpha.0`, indépendamment de la
version des trois intégrations existantes ; les deux voies n'ont jamais été
alignées implicitement depuis.

## Périmètre de la première alpha

Le point d'entrée principal comprend les valeurs nominales `DocumentPlan` et
`DocumentBatch`, la préparation et la validation complètes, ainsi que
`createMemoryDocument`. Les instantanés, suites et nœuds restent structurels
afin que chaque hôte puisse les produire sans fabrique imposée.

Le sous-chemin Google Docs comprend le périmètre déjà testé :

- paragraphes du corps et onglets imbriqués ;
- coordonnées UTF-16 et suggestions incorporées ;
- prévisualisations textuelles ou avec restauration limitée des styles ;
- revue nominale, validation ou abandon à usage unique ;
- écriture conditionnée par `requiredRevisionId` et relecture complète ;
- transport REST fondé sur `fetch` et un fournisseur de jeton injectés.

Les en-têtes, pieds de page, notes, tableaux, objets incorporés, liens lors des
insertions stylées, OAuth, stockage de jetons, retries et interface utilisateur
restent exclus. Ces limites doivent apparaître dans le README publié.

## État des prérequis (septembre 2026)

`@orthotypography/core@0.1.0-alpha.2`, qui contient `applyTextChanges`, était
publié sous la même version immuable sur JSR et npm. La configuration autonome
du SDK utilisait alors cette version plutôt qu'une URL de commit ; elle dépend
aujourd'hui de `@orthotypography/core@0.2.0-alpha.0`.

Le paquet réside désormais dans `packages/editor-sdk`, avec sa propre version,
ses deux exports et ses contrôles de publication. Son workflow et son registre
de reprise restent séparés de ceux des trois adaptateurs Astro.

## Critères d'activation (septembre 2026)

La PR d'activation satisfaisait les critères suivants sans publier de paquet :

1. publier une nouvelle alpha de `@orthotypography/core` contenant
   `applyTextChanges` — fait avec `0.1.0-alpha.2` ;
2. remplacer l'URL de commit par cette version dans les imports JSR et sa
   correspondance npm — fait ;
3. déclarer les exports `.` et `./google-docs` dans le `deno.json` du paquet —
   fait ;
4. construire les deux points d'entrée avec dnt et vérifier leurs déclarations
   sous Node — fait ;
5. ajouter des tests d'import JSR et npm pour les deux sous-chemins — fait ;
6. exécuter `deno publish --dry-run --check` sur le nouveau paquet — intégré à
   la CI et au workflow de release ;
7. étendre séparément la détection de présence JSR/npm et la reprise de
   publication, sans imposer sa version aux trois intégrations Astro — fait ;
8. vérifier les métadonnées, la licence, les fichiers inclus et l'absence des
   fixtures de validation réelle dans les archives publiées — fait dans les
   contrôles JSR et npm.

La PR d'activation n'a rien publié ; la release `editor-sdk-v0.1.0-alpha.0` a
ensuite déclenché la première publication, le 9 septembre 2026.
