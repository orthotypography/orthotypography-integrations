# Feuille de route des intégrations

État vérifié le 19 octobre 2026 sur
[`0a3ee14`](https://github.com/orthotypography/orthotypography-integrations/commit/0a3ee14),
après la fusion des
[PR nº 8](https://github.com/orthotypography/orthotypography-integrations/pull/8),
[nº 9](https://github.com/orthotypography/orthotypography-integrations/pull/9)
et
[nº 10](https://github.com/orthotypography/orthotypography-integrations/pull/10).
Les deux voies ont été développées sur `main` contre le commit `71d23ea` du
cœur, avec une CI verte (`test`, `npm-package`, `editor-sdk`), puis réépinglées
sur `22b5a10`, qui corrige le défaut relevé par le premier test réel dans Google
Docs. Les adaptateurs `0.1.0-alpha.2` et le SDK `0.1.0-alpha.1`, tous deux sur
le cœur `0.1.0-alpha.3`, ont fait l'objet des releases GitHub du 26 septembre ;
leur présence sur npm (tag `latest`) est vérifiée, celle sur JSR ne l'a pas été
à cette date. Le cœur prépare sa ligne `0.2`, non publiée (§ « Passage au
cœur 0.2 »). Les tâches ci-dessous sont proposées, sans engagement de date.

## État acquis

| Chantier                   | État vérifié                                                                                                                                                                                                                                                                                            | Preuve                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown / Astro           | Rehype, Sätteri et Astro publiés en `0.1.0-alpha.2`, cible Astro 7 ; processeur configuré préservé, diagnostics et changements localisés exposés                                                                                                                                                        | [Release](https://github.com/orthotypography/orthotypography-integrations/releases/tag/v0.1.0-alpha.2), [configuration](../deno.json)                                 |
| Dépendance des adaptateurs | Versions publiées sur le cœur `0.1.0-alpha.3` ; développement contre le commit [`22b5a10`](https://github.com/orthotypography/orthotypography/commit/22b5a105f13e0e94955aa1ca20561a79c47047fc) de la ligne `0.2`, testé hors ligne ; publication impossible sur ce commit                               | [Configuration](../deno.json), `deno task core:status`                                                                                                                |
| SDK neutre                 | `@orthotypography/editor-sdk@0.1.0-alpha.1` publié ; instantanés et plans immuables, validation complète, adaptateur atomique en mémoire                                                                                                                                                                | [Release SDK](https://github.com/orthotypography/orthotypography-integrations/releases/tag/editor-sdk-v0.1.0-alpha.1), [README SDK](../packages/editor-sdk/README.md) |
| Dépendance du SDK          | Version publiée sur le cœur `0.1.0-alpha.3` ; développement contre le commit [`22b5a10`](https://github.com/orthotypography/orthotypography/commit/22b5a105f13e0e94955aa1ca20561a79c47047fc) du cœur, qui contient le mode `review` (PR nº 57), testé hors ligne ; publication impossible sur ce commit | [Manifeste SDK](../packages/editor-sdk/deno.json), `deno task core:status`                                                                                            |
| Google Docs                | Extraction des paragraphes et onglets imbriqués, coordonnées UTF-16, compilation conditionnelle, restauration limitée des styles                                                                                                                                                                        | [Périmètre](google-docs-preview.md), [README SDK](../packages/editor-sdk/README.md)                                                                                   |
| Transport et révision      | Transport REST injecté, relecture vérifiée, préparation / validation / abandon d'une révision proposée ; objets à usage unique                                                                                                                                                                          | [README SDK](../packages/editor-sdk/README.md)                                                                                                                        |
| Tests SDK                  | 67 tests pour la release alpha.1 contre le cœur `0.1.0-alpha.3` ; 80 tests exécutés hors ligne le 19 octobre contre le commit `22b5a10` du cœur, dont la passe `review`, les groupes, l'acceptation partielle, les corrections écartées et une relecture Google Docs simulée                            | Tests du SDK ; aucune exécution réelle                                                                                                                                |
| Validation réelle          | Scénario limité exécuté via le connecteur Google Drive le 6 septembre avec le cœur `0.1.0-alpha.2`, non rejoué depuis ; ni la passe `review`, ni l'acceptation par groupes, ni le transport REST direct ne sont validés en conditions réelles                                                           | [Compte rendu](google-docs-live-validation.md)                                                                                                                        |

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
OAuth, ni relance automatique. La persistance des plans est hors du contrat. Sur
la ligne de développement, l'acceptation partielle porte sur des groupes entiers
du plan courant et les corrections écartées restent à la charge de l'application
cliente ; ce contrat n'est vérifié que par des tests hors ligne.

## Passage au cœur 0.2

Le cœur réalise, dans sa ligne `0.2` non publiée, la conception « diagnostics
reliés à leurs changements »
([`docs/conception-resultats-v0.1.md`](https://github.com/orthotypography/orthotypography/blob/main/docs/conception-resultats-v0.1.md),
§ 9 pour les intégrations) : nouvelle interface des règles (PR nº 50 du cœur),
modifications portées par les diagnostics et emplacements toujours sources (nº
52, 53), identifiants de changements et groupes de propositions (nº 56), mode
`review` et propositions écartées (nº 57), puis correction de l'espace après
`?`, `!`, `:` et `;` devant un signe fermant (nº 58, anomalie nº 54), d'une
espace correcte voisine de ces signes dans des segments séparés (nº 64, anomalie
nº 63, relevée par le premier test réel dans Google Docs), compilation des
presets et langues canonisées (nº 62), tous fusionnés au 19 octobre. Depuis la
nº 62, une suite dont aucune règle d'une composition non vide ne prend en charge
la langue lève une erreur au lieu de rester inchangée. Chaque voie s'y adapte
d'abord contre une dépendance de développement immuable, un commit précis du
cœur, puis contre la `0.2` une fois publiée sur instruction explicite. Une voie
épinglée sur un commit ne peut être ni empaquetée ni publiée ; la CI saute ses
contrôles JSR et npm
([`CONTRIBUTING.md`](../CONTRIBUTING.md#trying-an-unreleased-engine)).

| Étape | Voie        | Contenu                                                                                                                                                                                                                                                      | État                                                                                                                                                                                                                         |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Adaptateurs | Commit `22b5a10` (`main` du cœur après la PR nº 64) ; diagnostics toujours en coordonnées sources, `coordinateSpace` et `segmentRevision` retirés de `AdapterDiagnostic` ; application tout ou rien, groupes non exposés                                     | fusionné ([PR nº 8](https://github.com/orthotypography/orthotypography-integrations/pull/8)), testé hors ligne                                                                                                               |
| 2     | SDK         | Commit `22b5a10`, comme les adaptateurs ; passe unique `review`, groupes exposés par le plan, validation et commit Google Docs par groupes entiers, propositions écartées transmises au cœur                                                                 | fusionné ([PR nº 9](https://github.com/orthotypography/orthotypography-integrations/pull/9), portée sur `main` par la [PR nº 10](https://github.com/orthotypography/orthotypography-integrations/pull/10)), testé hors ligne |
| 3     | Les deux    | Passage au cœur `0.2` publié, puis releases des deux voies                                                                                                                                                                                                   | sur instruction explicite                                                                                                                                                                                                    |
| 4     | SDK         | Validation réelle dans Google Docs de la passe `review`, de l'acceptation par groupes, d'une correction écartée et du transport REST direct, sur le commit de développement avant la publication du cœur, puis vérification rapide avec le cœur `0.2` publié | autorisée le 19 octobre, en préparation ; distincte des tests hors ligne                                                                                                                                                     |

Les tests hors ligne de l'étape 2 utilisent une relecture Google Docs simulée à
partir de la fixture du 6 septembre ; ils ne remplacent pas l'étape 4.
L'[anomalie nº 54](https://github.com/orthotypography/orthotypography/issues/54)
du cœur, où l'espace après `?`, `!`, `:` et `;` devant un signe fermant (`»`)
produisait des groupes contradictoires, sans changement, est corrigée par la PR
nº 58, incluse dans le commit épinglé. Le contrat admet toujours un groupe dont
les propositions s'annulent : il peut être accepté sans effet, et une
application devrait présenter ses diagnostics comme contradictoires.

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
   limité d'affichage des diagnostics, des groupes et de leurs indications
   `suggested`, acceptation de groupes entiers ou abandon, conservation et mise
   à jour des corrections écartées, nouvelle préparation après chaque
   acceptation et présentation des conflits et des groupes contradictoires.
   L'application gère les identifiants ; le SDK conserve son contrat atomique et
   ses exclusions.
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
