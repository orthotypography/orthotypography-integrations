# Changelog

All notable changes to this repository are documented in this file. The Markdown
and Astro adapters (`rehype`, `satteri`, and `astro`) share one version and the
`v<version>` release tags; the editor SDK has its own version and the
`editor-sdk-v<version>` release tags.

## Unreleased

### Repository

- `deno task core:status` reports whether each release lane depends on a
  published core or on an immutable development commit. CI runs the JSR dry runs
  and npm package checks of a lane only when it depends on a published core, and
  `scripts/build_npm.ts` refuses to package a lane pinned to a development
  commit.

## Editor SDK 0.2.0-alpha.0 - 2026-10-19

- Upgrade from `@orthotypography/core@0.1.0-alpha.3` to `0.2.0-alpha.0`, after
  development against core commits of the `0.2` line. The core brings the review
  mode and dismissed proposals (core #57), and fixes for correct spaces next to
  `?`, `!`, `:`, and `;` or inside guillemets in split text runs (core #63 and
  #66), found by the first live Google Docs run and the live check simulator.
- **Breaking (from the core):** run locales are canonicalized, and
  `prepareDocumentPlan`, `prepareGoogleDocsReview`, and
  `normalizeGoogleDocsDocument` throw for a run whose locale no rule of a
  nonempty composition supports, instead of planning no change for it.
- **Breaking:** `prepareDocumentPlan` runs one core `review` pass per run
  instead of separate `lint` and `fix` passes. Diagnostics are linked to their
  changes (`groupId`, `changeIds`) and carry a `suggested` hint (`apply` or
  `review`) from their rule's default mode. `PlannedRun.groups` lists the
  proposal groups, each with its run ID, change IDs, diagnostic indexes, and
  `suggested`. Changes and preview still cover every group, so accepting every
  group reproduces the previous fix output.
- **Breaking:** `validateDocumentPlan(plan, current, accepted)` takes the
  accepted groups, as the original group objects of the plan, and returns the
  batch of their changes; copies, duplicates, and groups of another plan are
  rejected. `DocumentBatch.groups` lists the accepted groups, and each batch run
  exposes the resulting `preview` nodes. The memory adapter revalidates the
  accepted groups when it commits.
- `prepareDocumentPlan` accepts `{ dismissed }`: proposals declined by the
  application, designated by run, rule, and reported source location. They are
  validated, reported with `dismissed: true`, and left out of the cascade;
  `DocumentPlan.dismissed` records them. A dismissal naming an unknown run is
  rejected.
- **Breaking:** `previewGoogleDocsRequests` and
  `previewGoogleDocsStyledRequests` take the accepted groups.
  `commitGoogleDocsReview(transport, review, accepted)` compiles and writes only
  the accepted groups, returns them with the `committed` payload, and verifies
  the readback against them; an invalid selection throws before the review is
  consumed, and an empty selection consumes it without writing.
  `prepareGoogleDocsReview` and `normalizeGoogleDocsDocument` accept
  `dismissed`; `review.preview` and `normalizeGoogleDocsDocument` still cover
  every group.
- Synthetic test rules follow the core `0.2` rule interface.
- Report each lane's core dependency with `deno task core:status`; CI runs a
  lane's JSR dry runs and npm package checks only when it depends on a published
  core, and `scripts/build_npm.ts` refuses to package a lane pinned to a
  development core commit.

## Adapters 0.2.0-alpha.0 - 2026-10-19

- Upgrade `rehype`, `satteri`, and `astro` from
  `@orthotypography/core@0.1.0-alpha.3` to `0.2.0-alpha.0`, after development
  against core commits of the `0.2` line. Outputs follow the core changes since
  `0.1.0-alpha.3` listed in the core `CHANGELOG`, notably rules run once per
  logical run, so constructs split across inline nodes are corrected or
  protected; the space after `?`, `!`, `:`, and `;` before a closing sign, a
  comma, or a period is left as the Imprimerie nationale sets it (core issues
  #54 and #59); and a correct space next to these signs or inside French
  guillemets is left in its node when inline nodes split around it, instead of
  being moved or doubled (core issues #63 and #66). Diagnostics also carry the
  core's `messageId` and `messageArgs`, and core errors are typed
  `OrthotypographyError`s with a stable `code` (core #65).
- **Breaking (from the core):** locales are canonicalized (`fr-fr` now selects
  `fr-FR` rules), and a logical run whose locale no configured rule supports
  throws instead of passing through unchanged. Check the configured `locale`
  against the rules.
- **Breaking:** diagnostics are always located in the source text nodes.
  `coordinateSpace` and `segmentRevision` are removed from
  `AdapterDiagnosticLocation`; in `fix` mode, a subject inside text produced by
  an earlier fix is reported on the source range of that fix. Changes reported
  through `onChange` and `orthotypographyChanges` carry the core's `id`, unique
  within one logical run. The adapters still apply every change and do not
  expose proposal groups.
- Custom rules follow the core `0.2` rule interface (`apply(run: LogicalRun)`).
- Report each lane's core dependency with `deno task core:status`; CI runs a
  lane's JSR dry runs and npm package checks only when it depends on a published
  core, and `scripts/build_npm.ts` refuses to package a lane pinned to a
  development core commit.

## Editor SDK 0.1.0-alpha.1 - 2026-09-26

- Upgrade from `@orthotypography/core@0.1.0-alpha.2` to `0.1.0-alpha.3`. Plans
  prepared with the Imprimerie nationale compositions can include comma spacing
  and, with the full composition, the `etc.` rule; their changes carry the
  atomic high-punctuation rule IDs. On the live Google Docs fixture, the planned
  text is unchanged but takes nine changes and 26 requests instead of eight and
  24.
- Publish every `0.x` version under the npm `latest` tag instead of `alpha`,
  verify the tag at the end of each release, and publish to npm through trusted
  publishing only. The package installs without the `@alpha` suffix.
- Derive the version and core dependency checked in the generated npm package
  from the Deno manifest.

## Adapters 0.1.0-alpha.2 - 2026-09-26

- Upgrade `rehype`, `satteri`, and `astro` from
  `@orthotypography/core@0.1.0-alpha.1` to `0.1.0-alpha.3`. Hosts can use the
  new core rules, and `onChange` and `orthotypographyChanges` report the atomic
  high-punctuation rule IDs. Core compositions such as
  `IMPRIMERIE_NATIONALE_RULES` can produce more changes than before.
- Publish every `0.x` version under the npm `latest` tag instead of `alpha`,
  verify the tag at the end of each release, and publish to npm through trusted
  publishing only. The packages install without the `@alpha` suffix.
- Derive the core version declared in the generated npm packages from the Deno
  manifest instead of repeating it in the build and smoke scripts.

## Editor SDK 0.1.0-alpha.0 - 2026-09-09

- Add `@orthotypography/editor-sdk` with a neutral `.` entry point and a
  `./google-docs` entry point, released independently of the adapters.
- Prepare immutable, nominal document plans with source diagnostics, previews,
  and complete correction batches, and validate the document revision and source
  context before any native transaction.
- Add an in-memory reference adapter that commits complete batches atomically,
  detects conflicts, and simulates concurrent edits.
- Extract Google Docs paragraphs and their UTF-16 ranges across nested tabs, and
  reject unsupported structures explicitly.
- Translate corrections into ordered Google Docs requests guarded by the
  document revision, without network access.
- Restore styles for interior insertions explicitly, excluding links and
  paragraph boundaries; review previews distinguish plain-text and
  style-restoring modes in their types.
- Add a two-phase Google Docs review: preparation without writing, then a single
  commit of the same frozen object with its original transport and revision, or
  an explicit abort; lifecycle errors are typed.
- Add an authentication-neutral transport contract with full reads, one
  conditional write, typed conflicts, and verified readback.
- Add a REST adapter with injected `fetch` and access-token provider, without
  credential storage or automatic retries.
- Depend on `@orthotypography/core@0.1.0-alpha.2`.

## Adapters 0.1.0-alpha.1 - 2026-09-05

- Add the native `@orthotypography/satteri` adapter based on Sätteri's document
  HAST hooks, preserving logical text runs across nodes.
- Preserve Astro 7's configured Markdown processor: Sätteri receives the native
  adapter and Unified receives the rehype adapter.
- Keep `processorOptions` as an explicit compatibility path to Unified.
- Expose source-coordinate changes through `onChange` and
  `orthotypographyChanges` in the rehype, Sätteri, and Astro adapters.
- Add rendering checks for direct Sätteri and Astro use, diagnostics, and
  excluded segments.
- Extend coordinated publication and partial recovery to the three packages on
  JSR and npm.
- Upgrade to `@orthotypography/core@0.1.0-alpha.1`.

## Adapters 0.1.0-alpha.0 - 2026-09-02

- Add `@orthotypography/rehype`, which applies the published engine directly to
  runs of HAST text nodes without altering the tree.
- Preserve block boundaries, raw HTML, and `code`, `pre`, `script`, and `style`
  elements.
- Associate diagnostics with their source text segments.
- Add `@orthotypography/astro` for Astro 7's Unified processor and its inherited
  Markdown and MDX configuration.
- Generate both npm packages and publish them together on JSR and npm, with
  explicit recovery of partial publications.
