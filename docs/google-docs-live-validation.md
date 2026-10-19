# Google Docs : validation réelle du 6 septembre 2026

## Résultat et périmètre

Le SDK au commit `cf17660ca38aa0a284855974d9bed671c6eeb62f`, avec le cœur
`2d6af076bb32af2caa0e4171fbb7905396bd2c24`, a été exécuté sous Node 24.19.0
contre un document Google Docs jetable créé avec autorisation. Le transport
utilisé est le connecteur Google Drive de la session ; aucun transport ni
identifiant OAuth n'est ajouté au SDK.

Ce même état du cœur est désormais publié sous la version immuable
`@orthotypography/core@0.1.0-alpha.2`, utilisée par la configuration autonome du
SDK pour ses vérifications courantes.

Le scénario utilise `IMPRIMERIE_NATIONALE_PUNCTUATION_RULES` et la langue
`fr-FR`, pas le preset typographique complet. Il couvre deux paragraphes dans
l'onglet principal, un paragraphe dans un onglet enfant, leurs paragraphes vides
terminaux, des frontières de styles et un emoji avant les corrections.

- Huit corrections ont produit 24 requêtes : huit suppressions, huit insertions
  et huit restaurations de style, dans un seul lot conditionné par révision.
- La relecture correspond exactement au plan pour les cinq paragraphes : 117
  unités UTF-16 et leurs styles bruts, caractère par caractère. Les styles
  observés incluent l'héritage vide, le gras, l'italique et une couleur RGB.
- L'ordre et l'identité des onglets, ainsi que leur relation parent-enfant, ont
  été conservés. Une insertion allonge le premier paragraphe et décale les
  suivants ; les corrections restent correctement positionnées.
- Une nouvelle extraction et normalisation de la relecture produisent zéro
  correction et zéro requête.
- Le rejeu du lot avec sa révision initiale est refusé par Google : HTTP 400,
  `INVALID_ARGUMENT`, révision requise différente de la dernière révision. La
  réponse documentaire complète après ce refus est identique à celle lue avant
  le rejeu, révision comprise. Ce test utilise la première écriture comme
  modification intervenante ; il ne simule pas un second utilisateur connecté.

Un premier scénario a été refusé localement parce qu'une correction remplaçait
la ponctuation finale et touchait la frontière du paragraphe. Aucune requête de
correction n'a été envoyée pour ce plan. Un suffixe a été ajouté au texte du
scénario pour tester le sous-ensemble intérieur autorisé, sans assouplir le SDK.

## Particularité du connecteur

`get_document` expose ici une liste aplatie avec `tabId`, `parentTabId`, `body`
et `suggestionsViewMode`, et non la forme native `tabProperties`, `documentTab`,
`childTabs` attendue par l'extracteur. Le banc d'essai a explicitement
reconstruit les enveloppes et les liens parent-enfant à partir de cette lecture
complète, sans modifier les corps, indices ou styles. La révision et l'identité
du document proviennent de la même réponse. Aucun masque de champs n'a été
utilisé.

Cette conversion locale n'est pas un adaptateur public et ne démontre pas que le
connecteur préserve toutes les propriétés d'une réponse native quelconque.
L'extracteur conserve donc son contrat strict de réponse native complète ; il
n'accepte pas implicitement les données aplaties. Un futur transport devra
traiter cette différence explicitement et refuser les topologies incohérentes ou
les réponses incomplètes.

Les requêtes transmises sont celles produites par
`previewGoogleDocsStyledRequests`, sans réécriture de leur contenu.
`preview.body.writeControl` est passé au paramètre `write_control` du
connecteur, avec `requiredRevisionId` uniquement. Aucun retry ou repli sans
styles n'a été employé.

## Régression conservée dans le dépôt

`packages/editor-sdk/tests/fixtures/google_docs_live.ts` conserve les corps
avant/après observés et la topologie reconstruite. Les identifiants
documentaires, d'onglets et de révisions sont remplacés par des valeurs de
fixture ; les URL et métadonnées sans rapport avec le scénario sont omises. Ce
fichier est une fixture dérivée de lectures réelles, pas une réponse native
brute archivée.

`google_docs_live_test.ts` vérifie le nombre de corrections et de requêtes, puis
compare le texte et les styles source au résultat observé, indépendamment de la
fusion éventuelle des TextRun par Google. Un second test vérifie l'idempotence.
Ces tests restent hors ligne : ils ne réexécutent pas le conflit distant. Lors
de cette validation, les 48 tests SDK passaient localement sous Deno 2.9.6 et
Node 24.19.0, avec résolution locale du cœur au commit alors épinglé (et
transformation TypeScript sous Node).

## Limites et suite

Ce résultat valide ce scénario, pas tous les styles acceptés par le compilateur.
Les tailles et familles de polices, les autres couleurs et indicateurs, les
listes, les liens, les suggestions, les tableaux, les contrôles, les sélections,
l'annulation et les effets de collaboration restent hors de cette validation.
Les refus et le périmètre expérimental existants restent en vigueur.

Le contrat de transport explicite a ensuite été ajouté : lecture complète,
validation de la réponse, écriture conditionnelle unique, classification des
conflits et relecture. Il reste indépendant des connecteurs de cette session et
ne reconstruit jamais un plan ancien après un conflit. Un adaptateur REST Google
Docs isolé le complète désormais avec `fetch` et un fournisseur de jeton
injectés. Il reste à valider cet adaptateur directement contre l'API avec des
identifiants fournis par l'application hôte. Le SDK a depuis été publié en
`0.1.0-alpha.0` ; aucun adaptateur natif général n'est annoncé.

## Portée après le passage au cœur `0.1.0-alpha.3`

Ce compte rendu reste attaché au cœur `0.1.0-alpha.2`. Avec `0.1.0-alpha.3`,
l'espace après un point d'exclamation devient une correction atomique distincte
: les fixtures hors ligne de ce scénario produisent neuf corrections et 26
requêtes au lieu de huit et 24, pour un texte planifié toujours identique à la
relecture réelle, styles compris. Ce lot de 26 requêtes n'a pas été exécuté dans
Google Docs ; seule la validation hors ligne couvre le SDK `0.1.0-alpha.1`.

## Ligne `0.2` : procédure de validation par le transport REST

La passe `review`, l'acceptation par groupes et les corrections écartées (PR nº
9 et 10) n'ont pas encore été exécutées dans Google Docs. Le script
[`packages/editor-sdk/live/google_docs_rest_check.ts`](../packages/editor-sdk/live/google_docs_rest_check.ts)
les déroule par `createGoogleDocsRestTransport`, sans connecteur, sur un
document jetable :

1. préparation : le document doit porter un titre commençant par
   `orthotypography-live-check` et ne contenir qu'un paragraphe vide dans un
   seul onglet ; sinon le script s'arrête sans écrire. Il y insère trois
   paragraphes de test, dont un mot en gras ;
2. passe `review` sans écriture : groupes, indications `suggested` (la règle de
   l'euro, en mode `review`, donne un groupe non suggéré) ;
3. commit partiel : tous les groupes du premier paragraphe, le premier du
   deuxième, aucun du troisième ; relecture vérifiée par le SDK ;
4. correction écartée dans le troisième paragraphe, puis commit avec
   restauration des styles de tous les autres groupes ;
5. conservation de la correction écartée par le client, qui en recalcule les
   identifiants natifs et les décalages après l'écriture : plus aucune requête ;
6. deux revues de la même révision : la première s'applique, la seconde est
   refusée en conflit de révision et le document reste inchangé ;
7. idempotence de la dernière passe.

Le jeton d'accès (portée `https://www.googleapis.com/auth/documents`) est fourni
par la personne qui exécute le script, comme le ferait une application hôte ; le
script ne l'affiche, ne l'enregistre ni ne le renouvelle. Le rapport JSON, écrit
dans `packages/editor-sdk/live-report.json` (ignoré par Git) et sur la sortie
standard, ne contient ni identifiant de document, ni révision, ni jeton. Depuis
une copie de la branche qui contient le script :

```sh
cd packages/editor-sdk
./live/run.sh
```

Le lanceur demande l'URL ou l'identifiant du document, puis le jeton sans
l'afficher. Un jeton de l'OAuth 2.0 Playground expire au bout d'une heure ; un
jeton sans la portée requise produit un échec `permission` consigné dans le
rapport.

Le test hors ligne `tests/google_docs_live_check_test.ts` exécute ce même
scénario contre un service Google Docs simulé en mémoire, au niveau HTTP ; il
valide la logique du script, pas le comportement réel du service. Le résultat de
l'exécution réelle sera consigné ici.

Les identifiants de suites et de nœuds de l'extracteur sont des indices natifs
absolus : toute écriture antérieure les déplace. Une application qui conserve
des corrections écartées doit donc les rattacher à une position stable (ici,
rang du paragraphe et du segment, décalages dans le segment) et les résoudre de
nouveau sur chaque lecture. Le script le fait explicitement ; ce point sera à
reprendre dans la conception de l'application cliente de référence.
