# Feuille de route des intégrations

État vérifié le 19 octobre 2026. Le cœur `0.2.0-alpha.0` est publié (npm, tag
`latest`, commit
[`ea17be8`](https://github.com/orthotypography/orthotypography/commit/ea17be8cf2e9d305d0c80a30ac1bb2e15d388421),
dont le code est celui du commit `ae78ecd` validé ici). Les deux voies en
dépendent désormais, après leur développement contre des commits de la ligne
`0.2` (PR nº 8 à 14) ; leurs propres releases ne sont pas encore préparées ni
publiées. Les adaptateurs `0.1.0-alpha.2` et le SDK `0.1.0-alpha.1`, tous deux
sur le cœur `0.1.0-alpha.3`, ont fait l'objet des releases GitHub du 26
septembre ; leur présence sur npm (tag `latest`) est vérifiée, celle sur JSR ne
l'a pas été à cette date. Le cœur prépare sa ligne `0.2`, non publiée
(§ « Passage au cœur 0.2 »). Les tâches ci-dessous sont proposées, sans
engagement de date.

## État acquis

| Chantier                   | État vérifié                                                                                                                                                                                                                                                                                                                                | Preuve                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown / Astro           | Rehype, Sätteri et Astro publiés en `0.1.0-alpha.2`, cible Astro 7 ; processeur configuré préservé, diagnostics et changements localisés exposés                                                                                                                                                                                            | [Release](https://github.com/orthotypography/orthotypography-integrations/releases/tag/v0.1.0-alpha.2), [configuration](../deno.json)                                 |
| Dépendance des adaptateurs | Versions publiées sur le cœur `0.1.0-alpha.3` ; `main` sur le cœur publié `0.2.0-alpha.0`, testé hors ligne                                                                                                                                                                                                                                 | [Configuration](../deno.json), `deno task core:status`                                                                                                                |
| SDK neutre                 | `@orthotypography/editor-sdk@0.1.0-alpha.1` publié ; instantanés et plans immuables, validation complète, adaptateur atomique en mémoire                                                                                                                                                                                                    | [Release SDK](https://github.com/orthotypography/orthotypography-integrations/releases/tag/editor-sdk-v0.1.0-alpha.1), [README SDK](../packages/editor-sdk/README.md) |
| Dépendance du SDK          | Version publiée sur le cœur `0.1.0-alpha.3` ; `main` sur le cœur publié `0.2.0-alpha.0`, testé hors ligne                                                                                                                                                                                                                                   | [Manifeste SDK](../packages/editor-sdk/deno.json), `deno task core:status`                                                                                            |
| Google Docs                | Extraction des paragraphes et onglets imbriqués, coordonnées UTF-16, compilation conditionnelle, restauration limitée des styles                                                                                                                                                                                                            | [Périmètre](google-docs-preview.md), [README SDK](../packages/editor-sdk/README.md)                                                                                   |
| Transport et révision      | Transport REST injecté, relecture vérifiée, préparation / validation / abandon d'une révision proposée ; objets à usage unique                                                                                                                                                                                                              | [README SDK](../packages/editor-sdk/README.md)                                                                                                                        |
| Tests SDK                  | 67 tests pour la release alpha.1 contre le cœur `0.1.0-alpha.3` ; 80 tests exécutés hors ligne le 19 octobre contre le commit `ae78ecd` du cœur, dont la passe `review`, les groupes, l'acceptation partielle, les corrections écartées et une relecture Google Docs simulée                                                                | Tests du SDK ; aucune exécution réelle                                                                                                                                |
| Validation réelle          | Le 6 septembre, scénario limité via le connecteur Google Drive avec le cœur `0.1.0-alpha.2`. Le 19 octobre, scénario complet de la ligne `0.2` par le transport REST direct, avec le cœur `ae78ecd` : passe `review`, commit partiel par groupes, correction écartée conservée, restauration des styles, conflit de révision et idempotence | [Compte rendu](google-docs-live-validation.md)                                                                                                                        |

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
cliente ; ce contrat est vérifié hors ligne et, pour un scénario de trois
paragraphes dans un onglet, en conditions réelles le 19 octobre.

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
nº 63, relevée par le premier test réel dans Google Docs), d'une espace correcte
à l'intérieur de guillemets dans des segments séparés, qui était doublée (nº 67,
anomalie nº 66, relevée par le simulateur du test réel), compilation des presets
et langues canonisées (nº 62), erreurs typées et messages codés (nº 65), tous
fusionnés au 19 octobre. Depuis la nº 62, une suite dont aucune règle d'une
composition non vide ne prend en charge la langue lève une erreur au lieu de
rester inchangée. Chaque voie s'y adapte d'abord contre une dépendance de
développement immuable, un commit précis du cœur, puis contre la `0.2` une fois
publiée sur instruction explicite. Une voie épinglée sur un commit ne peut être
ni empaquetée ni publiée ; la CI saute ses contrôles JSR et npm
([`CONTRIBUTING.md`](../CONTRIBUTING.md#trying-an-unreleased-engine)).

| Étape | Voie        | Contenu                                                                                                                                                                                                                                                      | État                                                                                                                                                                                                                                                       |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Adaptateurs | Commit `ae78ecd` (`main` du cœur après la PR nº 67) ; diagnostics toujours en coordonnées sources, `coordinateSpace` et `segmentRevision` retirés de `AdapterDiagnostic` ; application tout ou rien, groupes non exposés                                     | fusionné ([PR nº 8](https://github.com/orthotypography/orthotypography-integrations/pull/8)), testé hors ligne                                                                                                                                             |
| 2     | SDK         | Commit `ae78ecd`, comme les adaptateurs ; passe unique `review`, groupes exposés par le plan, validation et commit Google Docs par groupes entiers, propositions écartées transmises au cœur                                                                 | fusionné ([PR nº 9](https://github.com/orthotypography/orthotypography-integrations/pull/9), portée sur `main` par la [PR nº 10](https://github.com/orthotypography/orthotypography-integrations/pull/10)), testé hors ligne                               |
| 3     | Les deux    | Passage au cœur `0.2` publié, puis releases des deux voies                                                                                                                                                                                                   | cœur `0.2.0-alpha.0` adopté sur `main` ([PR nº 15](https://github.com/orthotypography/orthotypography-integrations/pull/15)) ; releases des adaptateurs et du SDK en `0.2.0-alpha.0` préparées, chacune dans sa PR ; publication sur instruction explicite |
| 4     | SDK         | Validation réelle dans Google Docs de la passe `review`, de l'acceptation par groupes, d'une correction écartée et du transport REST direct, sur le commit de développement avant la publication du cœur, puis vérification rapide avec le cœur `0.2` publié | validée en réel le 19 octobre avec le cœur `ae78ecd` ([compte rendu](google-docs-live-validation.md)) ; rejouée le même jour avec le cœur publié `0.2.0-alpha.0`, réussie selon la personne qui l'a lancée (rapport non versé au dépôt)                    |

Les tests hors ligne de l'étape 2 utilisent une relecture Google Docs simulée à
partir de la fixture du 6 septembre ; ils ne remplacent pas l'étape 4. Celle-ci
a révélé, par un premier essai réel puis par son simulateur, deux défauts
d'idempotence du cœur sur des segments que Google découpe seul (anomalies nº 63
et 66), corrigés au commit épinglé `ae78ecd`.
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
2. **Publier les releases sur le cœur `0.2.0-alpha.0`.** Les adaptateurs et le
   SDK sont préparés en `0.2.0-alpha.0`, dans deux PR distinctes et sans
   alignement implicite de leurs voies. Publier sur instruction explicite, puis
   mettre à jour cette feuille avec les preuves de publication.
3. **Google Docs : élargir la validation réelle.** Le transport REST est validé
   le 19 octobre pour un scénario de trois paragraphes dans un onglet
   (préparation sans écriture, écriture conditionnelle, relecture, conflit de
   révision, idempotence ; `deno task live:rest`). Restent à couvrir, un cas à
   la fois : plusieurs onglets, un second utilisateur simultané, et la
   vérification rapide avec le cœur `0.2` publié. Conserver des comptes rendus
   bornés et distinguer ces tests de celui effectué via le connecteur.
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
