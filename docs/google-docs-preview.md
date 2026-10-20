# Google Docs : prévisualisation des requêtes natives

Le point d'entrée `@orthotypography/editor-sdk/google-docs`, publié en version
alpha avec le SDK, réunit l'extraction, les compilateurs de requêtes, le contrat
de transport, la revue et l'adaptateur REST décrits ci-dessous. Les compilateurs
(`src/google-docs.ts` et `src/google-docs-style.ts`) transforment un plan en
requêtes révisables ; ils ne lisent ni ne modifient aucun document distant.
Seuls le transport et l'orchestration de revue écrivent, une fois par revue,
sous condition de révision.

## Choix de la cible

La documentation officielle de
[`documents.batchUpdate`](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate)
garantit l'application atomique du lot. `writeControl.requiredRevisionId` fait
échouer la requête si la révision n'est plus courante. Ce mécanisme correspond
au contrat de commit conditionnel du SDK. `targetRevisionId`, qui autorise une
résolution des modifications concurrentes par Google, ne convient pas à ce
contrat strict et n'est pas généré.

Les
[requêtes textuelles](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request)
utilisent des indices UTF-16 et acceptent un `tabId`. Le compilateur fournit
explicitement cet identifiant, ordonne les corrections par position décroissante
sur l'ensemble de chaque onglet et produit, selon le changement, une suppression
puis une insertion au même indice.

## Entrées et résultat

```ts
import { IMPRIMERIE_NATIONALE_RULES } from "@orthotypography/core";
import { prepareDocumentPlan } from "@orthotypography/editor-sdk";
import { previewGoogleDocsRequests } from "@orthotypography/editor-sdk/google-docs";

// Exemple synthétique : dans un adaptateur, ces données viennent du même GET.
const snapshot = {
  documentId: "document-id",
  revision: "revision-id",
  runs: [{
    id: "paragraph-1",
    locale: "fr-FR",
    nodes: [{ id: "text-1", value: "Bonjour !" }],
  }],
};
const ranges = [{
  runId: "paragraph-1",
  nodeId: "text-1",
  tabId: "tab-id",
  startIndex: 1,
  endIndex: 10,
}];
const plan = prepareDocumentPlan(snapshot, IMPRIMERIE_NATIONALE_RULES);
// Groupes acceptés : ici, tous les groupes du plan.
const accepted = plan.runs.flatMap((run) => run.groups);
const preview = previewGoogleDocsRequests(plan, snapshot, ranges, accepted);
// Examiner preview.body.requests et preview.body.writeControl.
```

L'appel revalide le plan et ne compile que les changements des groupes acceptés.
La table doit couvrir exactement ses nœuds, avec les longueurs UTF-16
correspondantes, sans doublon ni chevauchement. Les nœuds d'une suite doivent
être contigus dans un même onglet. L'ordre des suites fournies n'a pas besoin
d'être l'ordre natif. Les identifiants de nœuds restent locaux à chaque suite.
Le résultat est profondément figé. Un plan sans correction produit une liste
vide ; aucun appel distant n'est nécessaire.

Le périmètre initial est le texte non vide du corps, à l'intérieur de
paragraphes. L'extracteur doit exclure les terminateurs de paragraphes et
séparer les suites aux frontières sémantiques. Les notes, en-têtes, pieds de
page et objets intégrés ne sont pas pris en charge. Les nœuds protégés
participent au contexte, mais ne reçoivent pas de corrections. Le compilateur
rejette les limites qui coupent une paire de substituts UTF-16, les chaînes mal
formées, les retours de ligne et les caractères de contrôle ou privés BMP dans
les insertions. Ce sous-ensemble est volontairement plus strict que les
caractères acceptés par Google.

## Garanties et limites

La table de plages est une entrée de confiance de l'extracteur : vérifier sa
cohérence numérique ne prouve pas qu'elle correspond au document distant.
L'identité, la révision, le texte et les plages doivent provenir de la même
lecture. Une table ancienne de mêmes longueurs n'est pas détectable localement.
L'extracteur traite explicitement les onglets imbriqués et les suggestions, et
refuse les éléments non textuels (voir « Extraction des paragraphes »).

Google détermine automatiquement le style des insertions à partir du voisinage.
Le compilateur textuel ne rétablit pas les styles ; un second mode restaure un
sous-ensemble des styles (voir ci-dessous). Les liens et les insertions aux
frontières de paragraphes y restent refusés. La révision conditionnelle ne
résout pas ces points.

Aucun mécanisme OAuth, stockage de jeton ou retry n'est inclus. Le contrat
abstrait `google-docs-transport.ts` orchestre une lecture, une écriture
conditionnelle unique et une relecture vérifiée. L'adaptateur REST isolé
implémente ses deux opérations avec un jeton et `fetch` injectés ; les autres
hôtes peuvent fournir leur propre transport. Les tests rejouent les requêtes sur
des chaînes, vérifient leur résultat contre les prévisualisations du SDK et
couvrent les refus. Les [validations réelles](google-docs-live-validation.md)
couvrent deux scénarios bornés : corrections, certains styles et refus d'une
révision périmée par le connecteur Google Drive le 6 septembre 2026 ; passe
`review`, acceptation par groupes, correction écartée et transport REST direct
le 19 octobre 2026. Les autres styles et les cas encore refusés ne sont pas
validés.

Sources officielles consultées le 5 septembre 2026 : références `batchUpdate` et
`Request` ci-dessus.

## Extraction des paragraphes

`extractGoogleDocsBody(response, locale)`, dans `src/google-docs-extract.ts`,
transforme une réponse JSON complète en `{ snapshot, ranges }`, sans accès
réseau. Les deux objets proviennent ainsi de la même lecture et sont
profondément figés.

```ts
import { extractGoogleDocsBody } from "@orthotypography/editor-sdk/google-docs";

// response : réponse complète de documents.get obtenue par le transport.
const { snapshot, ranges } = extractGoogleDocsBody(response, "fr-FR");
const plan = prepareDocumentPlan(snapshot, IMPRIMERIE_NATIONALE_RULES);
const accepted = plan.runs.flatMap((run) => run.groups);
const preview = previewGoogleDocsRequests(plan, snapshot, ranges, accepted);
```

Le transport reçoit l'obligation de demander `includeTabsContent=true` et
`suggestionsViewMode=SUGGESTIONS_INLINE`, sans masque de champs. La fonction
exige des onglets renseignés, une identité documentaire et une révision. Elle ne
peut pas détecter un JSON tronqué qui conserverait une apparence cohérente : ne
pas fournir de réponse filtrée ou fabriquée dans un usage natif.

Chaque paragraphe forme une suite indépendante. Les limites entre `TextRun` sont
conservées ; seul le dernier retour à la ligne du paragraphe est retiré. Un
paragraphe vide conserve une suite sans nœuds. Les identifiants dérivent de
l'onglet et de l'indice source : ils sont locaux à la révision, pas persistants.
La langue est imposée explicitement pour l'ensemble de l'extraction ; aucune
inférence de langue ni de protection native n'est effectuée.

Le parcours inclut récursivement les onglets enfants. Les indices doivent être
contigus, entiers et conformes aux longueurs UTF-16. L'extraction échoue en
entier sur un tableau, une table des matières, un objet intégré ou positionné,
un saut de section autre que celui d'ouverture, ou une suggestion non vide. Les
styles textuels sont copiés et figés dans `ranges[].textStyle`, sans ajout au
cœur ni à l'instantané neutre. Les corps d'en-tête, de pied de page et de note
restent hors du périmètre ; une référence de note dans un paragraphe fait
échouer ce paragraphe et l'extraction.

Les tests utilisent des fixtures synthétiques conformes au sous-ensemble retenu.
Ils rejouent une sortie du compilateur, vérifient les onglets imbriqués, les
paragraphes vides et les refus. Une
[validation réelle limitée](google-docs-live-validation.md) a depuis été
réalisée sur un document jetable, avec une fixture de relecture anonymisée.

Références officielles vérifiées le 6 septembre 2026 :

- [documents.get](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get)
  pour les paramètres de lecture ;
- [Document, Tab et TextRun](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents)
  pour la structure, les suggestions et la révision. Google indique que la
  révision dépend de l'utilisateur et n'est disponible qu'avec un accès en
  modification ; elle ne doit pas être partagée entre utilisateurs.

## Prévisualisation avec styles : sous-ensemble prudent

```ts
import { previewGoogleDocsStyledRequests } from "@orthotypography/editor-sdk/google-docs";

const styledPreview = previewGoogleDocsStyledRequests(
  plan,
  snapshot,
  ranges,
  accepted,
);
```

Ce mode conserve le lot textuel et ajoute immédiatement après chaque insertion
une requête `updateTextStyle` couvrant le texte inséré. Le style choisi est
celui du nœud source auquel le cœur attribue le changement, y compris pour une
espace déplacée entre deux nœuds. Il ne provient pas du voisinage après
modification.

Le masque énumère les propriétés textuelles prises en charge, y compris celles
absentes du style source : les valeurs omises sont ainsi réinitialisées, selon
le mécanisme documenté par Google. Les valeurs booléennes explicites `false`
restent distinctes de l'absence de propriété. Les styles hérités restent
hérités, sans résolution artificielle en valeurs visuelles. Le masque n'utilise
pas `*`.

Le sous-ensemble accepte les cinq indicateurs booléens, les couleurs RGB ou
transparentes, la taille en points, la famille et le poids de police, et le
décalage de ligne de base. Il exige une métadonnée de style sur chaque plage (un
objet vide représente un style hérité). Il refuse les propriétés inconnues ou
invalides, tout lien dans les plages fournies, les insertions ambiguës au même
indice et celles touchant un début ou une fin de paragraphe. Ces bornes sont
aussi suivies au fil des suppressions et insertions précédentes.

Ces restrictions répondent aux effets documentés de Google : modifier un lien
peut affecter les liens voisins et les autres propriétés ; une plage de style
peut être étendue aux retours à la ligne adjacents et affecter une puce. Le mode
textuel reste disponible pour la prévisualisation des cas refusés ; aucun repli
automatique vers une écriture sans styles n'est effectué.

Les plages et leurs styles doivent toujours provenir de la même réponse complète
que l'instantané. La validation locale ne prouve pas leur correspondance avec
Google. Les tests rejouent les opérations sur des caractères munis de styles,
avec simulation de l'héritage du voisin à l'insertion. Ils valident la
traduction, pas les effets réels de l'éditeur, ses sélections ou son historique
d'annulation.

Sources vérifiées le 6 septembre 2026 :
[TextStyle](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents#TextStyle)
et
[UpdateTextStyleRequest](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request#UpdateTextStyleRequest).

## Contrat de transport

`normalizeGoogleDocsDocument(transport, documentId, locale, rules, options)`
relie la lecture, l'extraction, la préparation du plan et le compilateur textuel
ou stylé. Le transport ne reçoit que deux opérations abstraites : `read`, avec
les exigences de lecture complète, et `write`, avec l'identité documentaire, les
requêtes et `requiredRevisionId` séparés.

L'écriture renvoie un résultat discriminé. `revision-conflict` devient un état
normal que l'appelant peut présenter avant de préparer un nouveau plan depuis
une nouvelle lecture ; le SDK ne réessaie jamais le lot périmé. Les échecs
`permission`, `invalid-request`, `transient` et `unknown` produisent une
`GoogleDocsTransportFailure` typée. Le transport doit classifier la réponse de
son fournisseur : le SDK ne dépend d'aucun code HTTP ni texte d'erreur Google.

Après une réussite déclarée, une seconde lecture complète doit présenter une
nouvelle révision et reproduire le texte prévu dans chaque paragraphe, dans le
même onglet. En mode stylé, les styles sont comparés par unité UTF-16, ce qui
tolère la fusion ou la division des `TextRun` par Google. Toute divergence lève
`GoogleDocsReadbackError` ; elle n'entraîne ni retry ni tentative de réparation.
Un plan vide évite l'écriture et la seconde lecture.

Ce contrat ne fournit toujours ni authentification, ni client réseau, ni
conversion implicite d'une réponse aplatie, ni garantie de sélection ou
d'annulation. Il rend ces responsabilités explicites et testables sans lier le
SDK à un environnement d'exécution.

## Adaptateur REST isolé

`createGoogleDocsRestTransport`, dans `google-docs-rest.ts`, implémente ce
contrat pour l'API Google Docs v1. L'hôte injecte `getAccessToken` et peut
injecter une fonction `fetch` compatible avec les standards du Web. Le module
n'acquiert, ne rafraîchit, ne conserve et ne journalise aucun jeton.

La lecture appelle `documents.get` avec `includeTabsContent=true` et
`suggestionsViewMode=SUGGESTIONS_INLINE`, sans masque de champs. L'écriture
transmet les requêtes et `requiredRevisionId` sans les transformer à
`documents.batchUpdate`. Il n'existe toujours aucun retry automatique.

L'adaptateur classe 401 et 403 comme échecs d'autorisation, 408, 429 et 5xx
comme échecs transitoires, et les autres réponses 400 comme requêtes invalides.
Le conflit de révision observé pendant la validation réelle est reconnu
uniquement si Google renvoie à la fois `INVALID_ARGUMENT` et un message
indiquant que la révision exigée ne correspond pas à la dernière révision. Cette
reconnaissance étroite évite de traiter une autre requête invalide comme un
conflit pouvant être replanifié. Une évolution du message fournisseur sera donc
classée prudemment comme `invalid-request` jusqu'à vérification.

Les échecs réseau ne reproduisent pas leurs diagnostics bruts dans le résultat,
afin de ne pas propager accidentellement des détails sensibles. Les erreurs de
lecture utilisent `GoogleDocsRestReadError`; les écritures renvoient les
catégories du contrat commun.

Un test d'intégration hors ligne relie l'adaptateur REST à l'orchestrateur avec
les corps avant/après issus de la validation réelle. Il vérifie la séquence
`GET`, `POST`, `GET`, les 26 requêtes stylées, la révision exigée, la relecture
finale et l'absence du jeton dans le corps JSON. Ce test valide la composition
et la sérialisation, pas l'accès réseau ni le flux OAuth. L'exécution réelle du
transport REST contre Google est consignée séparément, le 19 octobre 2026, dans
[`google-docs-live-validation.md`](google-docs-live-validation.md).

L'appel à `normalizeGoogleDocsDocument` constitue une demande d'écriture de tous
les groupes lorsque le plan n'est pas vide. Pour une revue humaine,
`prepareGoogleDocsReview` effectue seulement la lecture, l'extraction, le plan
et la prévisualisation de tous les groupes ; l'option `dismissed` y transmet les
corrections écartées. `commitGoogleDocsReview` reçoit ensuite le même objet et
les groupes acceptés par l'utilisateur : il compile leurs seules requêtes,
exposées dans `committed` avec `accepted`, les écrit en une fois sous la
révision lue et vérifie la relecture contre ces seuls groupes. Une sélection
invalide est refusée avant que la revue soit consommée ; une sélection vide
consomme la revue sans écriture. Seul l'objet original, figé et associé à
l'instance de transport qui l'a lu, est accepté. Les clones, reconstructions et
objets désérialisés sont refusés. Le type nominal empêche également une
reconstruction structurelle en TypeScript. Lors d'un refus ou de la fermeture de
l'interface, `discardGoogleDocsReview` consomme explicitement la revue sans
aucune écriture.

Une revue est consommée avant son unique tentative d'écriture. Une réussite, un
conflit, un autre échec ou deux appels concurrents ne peuvent donc pas rejouer
le lot. Une revue explicitement écartée ne peut pas être validée ensuite. Les
erreurs de provenance, de transport ou de cycle de vie sont exposées par
`GoogleDocsReviewError` avec une catégorie stable. La condition de révision du
serveur reste la protection contre une modification intervenue pendant la revue.
Après un conflit, l'application doit préparer et présenter une nouvelle revue
depuis une nouvelle lecture.

Le champ discriminant `mode` vaut `text` pour une prévisualisation textuelle et
`preserve-styles` lorsque les requêtes de restauration des styles sont incluses.
L'interface consommatrice doit utiliser ce champ pour préciser le type de
`preview`, sans le déduire d'un état extérieur à la revue. Les surcharges
TypeScript conservent aussi le mode connu depuis l'option `preserveStyles`
jusqu'au résultat de la validation.
