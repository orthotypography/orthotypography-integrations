# Feuille de route des intégrations

État vérifié le 20 octobre 2026. Les adaptateurs `0.2.0-alpha.0` et le SDK
`0.2.0-alpha.0` sont publiés sur JSR et npm (tag `latest`), sur le cœur publié
`0.2.0-alpha.0`, depuis le commit
[`233cef6`](https://github.com/orthotypography/orthotypography-integrations/commit/233cef63a56110465d26610798d6f6f99ce2f1d1)
(§ « Publication du 19 octobre »). Depuis le 20 octobre, `main` ne contient plus
le point d'entrée `./google-docs` du SDK ; ce retrait n'est pas publié. Les
tâches ci-dessous sont proposées, sans engagement de date.

## État acquis

| Chantier                   | État vérifié                                                                                                                                                                                                                                                     | Preuve                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown / Astro           | Rehype, Sätteri et Astro publiés en `0.2.0-alpha.0`, cible Astro 7 ; processeur configuré préservé, diagnostics en coordonnées sources et changements localisés exposés, application tout ou rien                                                                | [Release](https://github.com/orthotypography/orthotypography-integrations/releases/tag/v0.2.0-alpha.0), [configuration](../deno.json)                                                 |
| Dépendance des adaptateurs | Cœur publié `0.2.0-alpha.0`                                                                                                                                                                                                                                      | [Configuration](../deno.json), `deno task core:status`                                                                                                                                |
| SDK neutre                 | `@orthotypography/editor-sdk@0.2.0-alpha.0` publié ; passe `review` unique, groupes de propositions, acceptation par groupes entiers, propositions écartées ; plans immuables, validation complète, adaptateur atomique en mémoire                               | [Release SDK](https://github.com/orthotypography/orthotypography-integrations/releases/tag/editor-sdk-v0.2.0-alpha.0), [README SDK](../packages/editor-sdk/README.md)                 |
| Dépendance du SDK          | Cœur publié `0.2.0-alpha.0`                                                                                                                                                                                                                                      | [Manifeste SDK](../packages/editor-sdk/deno.json), `deno task core:status`                                                                                                            |
| Point d'entrée Google Docs | Livré dans `@orthotypography/editor-sdk` jusqu'à `0.2.0-alpha.0` ; retiré de `main` le 20 octobre, retrait non publié. L'adaptateur Google Docs est développé hors de ce dépôt                                                                                   | [CHANGELOG](../CHANGELOG.md), [manifeste SDK](../packages/editor-sdk/deno.json)                                                                                                       |
| Tests SDK                  | 33 tests hors ligne au 20 octobre, sur le cœur `0.2.0-alpha.0` : passe `review`, groupes, acceptation partielle, corrections écartées, adaptateur en mémoire, point d'entrée unique                                                                              | Tests du SDK, CI                                                                                                                                                                      |
| Validation réelle          | Le point d'entrée Google Docs a été validé en réel le 6 septembre (connecteur Google Drive, cœur `0.1.0-alpha.2`) et le 19 octobre (transport REST, cœur `ae78ecd`) ; ces validations portaient sur le SDK et ce point d'entrée ensemble, à leur version d'alors | [Compte rendu au commit `cabfce0`](https://github.com/orthotypography/orthotypography-integrations/blob/cabfce09e9f7db0359d69d7a24b019b9c3deafce/docs/google-docs-live-validation.md) |

Le SDK est dans `packages/editor-sdk` et n'expose plus que son point d'entrée
neutre `.` ; sa version est indépendante de celle des trois adaptateurs Astro.

## Limites du SDK

Le SDK ne fournit ni interface utilisateur, ni acquisition ou stockage
d'autorisations, ni relance automatique ; la persistance des plans est hors du
contrat. L'acceptation partielle porte sur des groupes entiers du plan courant,
et les corrections écartées restent à la charge de l'application cliente. Ce
contrat est vérifié hors ligne par l'adaptateur en mémoire ; chaque adaptateur
d'éditeur doit en apporter la garantie atomique native.

## Passage au cœur 0.2

Le cœur a réalisé, dans sa ligne `0.2`, publiée en `0.2.0-alpha.0` le 19
octobre, la conception « diagnostics reliés à leurs changements »
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

| Étape | Voie        | Contenu                                                                                                                                                                                                                                                      | État                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Adaptateurs | Commit `ae78ecd` (`main` du cœur après la PR nº 67) ; diagnostics toujours en coordonnées sources, `coordinateSpace` et `segmentRevision` retirés de `AdapterDiagnostic` ; application tout ou rien, groupes non exposés                                     | fusionné ([PR nº 8](https://github.com/orthotypography/orthotypography-integrations/pull/8)), testé hors ligne                                                                                                                                                                                                                                             |
| 2     | SDK         | Commit `ae78ecd`, comme les adaptateurs ; passe unique `review`, groupes exposés par le plan, validation et commit Google Docs par groupes entiers, propositions écartées transmises au cœur                                                                 | fusionné ([PR nº 9](https://github.com/orthotypography/orthotypography-integrations/pull/9), portée sur `main` par la [PR nº 10](https://github.com/orthotypography/orthotypography-integrations/pull/10)), testé hors ligne                                                                                                                               |
| 3     | Les deux    | Passage au cœur `0.2` publié, puis releases des deux voies                                                                                                                                                                                                   | publié le 19 octobre : adaptateurs et SDK `0.2.0-alpha.0` sur JSR et npm                                                                                                                                                                                                                                                                                   |
| 4     | SDK         | Validation réelle dans Google Docs de la passe `review`, de l'acceptation par groupes, d'une correction écartée et du transport REST direct, sur le commit de développement avant la publication du cœur, puis vérification rapide avec le cœur `0.2` publié | validée en réel le 19 octobre avec le cœur `ae78ecd` ([compte rendu](https://github.com/orthotypography/orthotypography-integrations/blob/cabfce09e9f7db0359d69d7a24b019b9c3deafce/docs/google-docs-live-validation.md)) ; rejouée le même jour avec le cœur publié `0.2.0-alpha.0`, réussie selon la personne qui l'a lancée (rapport non versé au dépôt) |

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

## Publication du 19 octobre

Les releases GitHub
[`v0.2.0-alpha.0`](https://github.com/orthotypography/orthotypography-integrations/releases/tag/v0.2.0-alpha.0)
et
[`editor-sdk-v0.2.0-alpha.0`](https://github.com/orthotypography/orthotypography-integrations/releases/tag/editor-sdk-v0.2.0-alpha.0)
ont été créées sur `233cef6`, dont la CI passait (`test`, `npm-package`,
`editor-sdk`). Les deux premiers jobs de publication ont échoué après une heure
pour le SDK et trois heures pour les adaptateurs, pendant un fort ralentissement
de JSR ; leurs journaux n'ont pas été conservés dans ce dépôt. Les quatre
paquets sont sur npm en `0.2.0-alpha.0`, tag `latest`, avec attestation de
provenance et `gitHead` `233cef6`, publiés entre 18 h 01 et 19 h 54 UTC. Les
deux workflows, relancés par `workflow_dispatch` avec leur tag entre 20 h 07 et
20 h 08 UTC, ont réussi, y compris leur vérification finale de la présence de
chaque version sur JSR et npm et du tag npm attendu.

## Prochaines tâches proposées

1. **Publier le retrait de `./google-docs`.** Le retrait est un changement
   cassant du SDK, consigné dans le [CHANGELOG](../CHANGELOG.md) ; il sera
   publié avec la prochaine version du SDK, sur instruction explicite.
2. **Application cliente de référence.** Définir puis réaliser un parcours
   limité d'affichage des diagnostics, des groupes et de leurs indications
   `suggested`, acceptation de groupes entiers ou abandon, conservation et mise
   à jour des corrections écartées, nouvelle préparation après chaque
   acceptation et présentation des conflits et des groupes contradictoires.
   L'application gère les identifiants ; le SDK conserve son contrat atomique et
   ses exclusions.
3. **Extension des capacités documentaires.** Prioriser une structure ou un cas
   de style à la fois après les validations précédentes. Exiger des scénarios
   réels et des refus explicites avant d'élargir les garanties.

## Coordination et releases

Le chat Markdown / Astro pilote les trois adaptateurs ; le chat SDK / Google
Docs pilote le contrat documentaire neutre du SDK. La
[feuille du cœur](https://github.com/orthotypography/orthotypography/blob/main/docs/roadmap.md)
porte les règles et le contrat de changements. Coordonner toute évolution
partagée avant des implémentations parallèles.

Les tags `v<version>` publient les adaptateurs ; les tags
`editor-sdk-v<version>` publient uniquement le SDK. Consulter les workflows et
[RELEASING.md](../RELEASING.md) avant une release. Chaque tâche doit préciser
son périmètre, ses critères d'acceptation, ses validations et les liens
d'issue/PR disponibles. Mettre à jour cette feuille après fusion, validation
réelle ou publication, avec les preuves correspondantes.
