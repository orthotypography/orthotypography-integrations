# Feuille de route des intégrations

État vérifié le 19 octobre 2026 sur
[`c14dd25`](https://github.com/orthotypography/orthotypography-integrations/commit/c14dd25),
après la fusion des PR nº 4 à 7. Les adaptateurs `0.1.0-alpha.2` et le SDK
`0.1.0-alpha.1`, tous deux sur le cœur `0.1.0-alpha.3`, ont fait l'objet des
releases GitHub du 26 septembre ; leur présence sur npm (tag `latest`) est
vérifiée, celle sur JSR ne l'a pas été à cette date. Le cœur prépare sa ligne
`0.2`, non publiée (§ « Passage au cœur 0.2 »). Les tâches ci-dessous sont
proposées, sans engagement de date.

## État acquis

| Chantier                   | État vérifié                                                                                                                                                                                                                                                              | Preuve                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown / Astro           | Rehype, Sätteri et Astro publiés en `0.1.0-alpha.2`, cible Astro 7 ; processeur configuré préservé, diagnostics et changements localisés exposés                                                                                                                          | [Release](https://github.com/orthotypography/orthotypography-integrations/releases/tag/v0.1.0-alpha.2), [configuration](../deno.json)                                 |
| Dépendance des adaptateurs | Versions publiées sur le cœur `0.1.0-alpha.3` ; développement contre le commit [`71d23ea`](https://github.com/orthotypography/orthotypography/commit/71d23eacad1a3722f316e65e3821f7fecad437e7) de la ligne `0.2`, testé hors ligne ; publication impossible sur ce commit | [Configuration](../deno.json), `deno task core:status`                                                                                                                |
| SDK neutre                 | `@orthotypography/editor-sdk@0.1.0-alpha.1` publié ; instantanés et plans immuables, validation complète, adaptateur atomique en mémoire                                                                                                                                  | [Release SDK](https://github.com/orthotypography/orthotypography-integrations/releases/tag/editor-sdk-v0.1.0-alpha.1), [README SDK](../packages/editor-sdk/README.md) |
| Dépendance du SDK          | Cœur `0.1.0-alpha.3` publié                                                                                                                                                                                                                                               | [Manifeste SDK](../packages/editor-sdk/deno.json)                                                                                                                     |
| Google Docs                | Extraction des paragraphes et onglets imbriqués, coordonnées UTF-16, compilation conditionnelle, restauration limitée des styles                                                                                                                                          | [Périmètre](google-docs-preview.md), [README SDK](../packages/editor-sdk/README.md)                                                                                   |
| Transport et révision      | Transport REST injecté, relecture vérifiée, préparation / validation / abandon d'une révision proposée ; objets à usage unique                                                                                                                                            | [README SDK](../packages/editor-sdk/README.md)                                                                                                                        |
| Tests SDK                  | 67 tests annoncés pour la release alpha.0 ; 67 tests exécutés hors ligne contre le cœur `0.1.0-alpha.3` sur la branche de préparation d'alpha.1                                                                                                                           | Release SDK ; ce nombre n'est pas une nouvelle exécution                                                                                                              |
| Validation réelle          | Scénario limité exécuté via le connecteur Google Drive le 6 septembre avec le cœur `0.1.0-alpha.2`, non rejoué avec `0.1.0-alpha.3` ; transport REST direct encore à valider en conditions réelles                                                                        | [Compte rendu](google-docs-live-validation.md)                                                                                                                        |

Le SDK est dans `packages/editor-sdk`. L'ancien état expérimental non publié ne
décrit plus la situation courante. Les deux points d'entrée `.` et
`./google-docs` sont livrés dans le même paquet ; la version du SDK est
indépendante de celle des trois adaptateurs Astro.

## Limites Google Docs

Le scénario réel couvre huit corrections, des onglets imbriqués, un emoji, des
styles hérités, gras, italiques et RGB, une relecture exacte, l'idempotence et
le rejet d'une ancienne révision. Il ne simule pas un second utilisateur
simultané. Les fixtures dérivées de ce scénario restent des tests hors ligne.

La restauration de styles est limitée aux insertions intérieures prises en
charge et sans liens. Les structures non prises en charge sont refusées. Les
en-têtes, pieds de page, notes, tableaux, objets incorporés, suggestions,
sélections et annulation ne disposent pas d'une garantie générale de prise en
charge. Le SDK ne fournit ni interface utilisateur, ni acquisition/stockage
OAuth, ni relance automatique. La persistance des plans et l'acceptation
partielle sont hors du contrat actuel.

## Passage au cœur 0.2

Le cœur réalise, dans sa ligne `0.2` non publiée, la conception « diagnostics
reliés à leurs changements »
([`docs/conception-resultats-v0.1.md`](https://github.com/orthotypography/orthotypography/blob/main/docs/conception-resultats-v0.1.md),
§ 9 pour les intégrations) : nouvelle interface des règles (PR nº 50 du cœur),
modifications portées par les diagnostics et emplacements toujours sources (nº
52, 53), identifiants de changements et groupes de propositions (nº 56), mode
`review` et propositions écartées (nº 57), puis correction de l'espace après
`?`, `!`, `:` et `;` devant un signe fermant (nº 58, anomalie nº 54), tous
fusionnés au 19 octobre. Chaque voie s'y adapte d'abord contre une dépendance de
développement immuable, un commit précis du cœur, puis contre la `0.2` une fois
publiée sur instruction explicite. Une voie épinglée sur un commit ne peut être
ni empaquetée ni publiée ; la CI saute ses contrôles JSR et npm
([`CONTRIBUTING.md`](../CONTRIBUTING.md#trying-an-unreleased-engine)).

| Étape | Voie        | Contenu                                                                                                                                                                                                                  | État                                    |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 1     | Adaptateurs | Commit `71d23ea` (`main` du cœur après la PR nº 58) ; diagnostics toujours en coordonnées sources, `coordinateSpace` et `segmentRevision` retirés de `AdapterDiagnostic` ; application tout ou rien, groupes non exposés | implémenté, testé hors ligne            |
| 2     | SDK         | Passe unique `review`, groupes de propositions, acceptation par groupes entiers, propositions écartées                                                                                                                   | à faire                                 |
| 3     | Les deux    | Passage au cœur `0.2` publié, puis releases des deux voies                                                                                                                                                               | sur instruction explicite               |
| 4     | SDK         | Validation réelle dans Google Docs avec le cœur `0.2`                                                                                                                                                                    | à faire, distincte des tests hors ligne |

## Prochaines tâches proposées

1. **Cohérence documentaire et linguistique.** Actualiser les mentions « non
   publié » et « aucun adaptateur natif » devenues obsolètes, notamment dans le
   README SDK et les notes documentaires. Traduire en anglais la prose hors de
   `docs/` et auditer les autres fichiers ; `RELEASING.md` et `CHANGELOG.md`
   sont traduits. Terminé lorsque l'état publié, les limites et la politique
   linguistique concordent sans modifier les données de test.
2. **Passer au cœur `0.2` publié.** Après la publication du cœur, remplacer dans
   chaque voie la dépendance de développement par la version publiée, vérifier
   les paquets JSR et npm, puis préparer les releases des adaptateurs et du SDK.
   Publier ensuite sur instruction explicite, sans aligner la version des
   adaptateurs sur celle du SDK.
3. **Google Docs : valider le transport REST réel.** Utiliser un document
   jetable et des identifiants fournis par l'application hôte. Vérifier
   préparation sans écriture, écriture conditionnelle, relecture, idempotence,
   révision périmée et absence de rejeu. Conserver un compte rendu borné et des
   fixtures nettoyées ; distinguer ce test de celui effectué via le connecteur.
4. **Application cliente de référence.** Définir puis réaliser un parcours
   limité d'affichage des diagnostics et prévisualisations, acceptation ou
   abandon, application et présentation des conflits. L'application gère les
   identifiants ; le SDK conserve son contrat atomique et ses exclusions.
5. **Extension des capacités documentaires.** Prioriser une structure ou un cas
   de style à la fois après les validations précédentes. Exiger des scénarios
   réels et des refus explicites avant d'élargir les garanties.

## Coordination et releases

Le chat Markdown / Astro pilote les trois adaptateurs ; le chat SDK / Google
Docs pilote le contrat documentaire et son premier fournisseur. La
[feuille du cœur](https://github.com/orthotypography/orthotypography/blob/main/docs/roadmap.md)
porte les règles et le contrat de changements. Coordonner toute évolution
partagée avant des implémentations parallèles.

Les tags `v<version>` publient les adaptateurs ; les tags
`editor-sdk-v<version>` publient uniquement le SDK. Consulter les workflows et
[RELEASING.md](../RELEASING.md) avant une release. Chaque tâche doit préciser
son périmètre, ses critères d'acceptation, ses validations et les liens
d'issue/PR disponibles. Mettre à jour cette feuille après fusion, validation
réelle ou publication, avec les preuves correspondantes.
