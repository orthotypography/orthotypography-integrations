# `@orthotypography/editor-sdk`

A JavaScript-compatible foundation for document editor adapters. It prepares
immutable correction plans and validates their complete source before a native
editor transaction. The module contains no editor API or Deno runtime
dependency.

This is an alpha release. Its API may change before `1.0.0`. The published
`0.1.0-alpha.1` uses `@orthotypography/core@0.1.0-alpha.3`. The development line
described below targets the unreleased core `0.2` and is pinned to a core
commit; it cannot be published until the core `0.2` is.

The package exposes `.` for the neutral contract and `./google-docs` for the
provider-specific surface. It uses an independent version from the Astro
integrations. The
[packaging note](https://github.com/orthotypography/orthotypography-integrations/blob/main/docs/editor-sdk-packaging-v0.1.md)
records that decision.

## Installation

```sh
npm install @orthotypography/editor-sdk
```

With Deno or another JSR client:

```sh
deno add jsr:@orthotypography/editor-sdk@0.1.0-alpha.1
```

## Prepare and validate

```ts
import { IMPRIMERIE_NATIONALE_RULES } from "@orthotypography/core";
import {
  prepareDocumentPlan,
  validateDocumentPlan,
} from "@orthotypography/editor-sdk";

const source = {
  documentId: "document-42",
  revision: "revision-7",
  runs: [{
    id: "paragraph-1",
    locale: "fr-FR",
    nodes: [
      { id: "emphasis", value: "Bonjour " },
      { id: "plain", value: ":suite" },
    ],
  }],
};

const plan = prepareDocumentPlan(source, IMPRIMERIE_NATIONALE_RULES);
// Display plan.runs: source diagnostics, proposal groups, and preview nodes.
// Here, accept the groups whose proposals all come from fix-mode rules.
const accepted = plan.runs.flatMap((run) =>
  run.groups.filter((group) => group.suggested)
);
// In an actual editor, read a fresh snapshot before validation.
const batch = validateDocumentPlan(plan, source, accepted);
// The adapter must atomically check batch.expectedRevision and commit ALL of
// the batch's changes.
```

Node identities are scoped to a run; run identities are scoped to a document.
All IDs, revisions, and locales must be nonempty. A run ends at each semantic
boundary. Known read-only text can participate as a protected node.

The SDK runs one core `review` pass per run: every rule proposes its
corrections, and each rule's default mode becomes a `suggested` hint (`apply` or
`review`) on its proposals and on their groups. Diagnostics, including related
locations, refer to the original run's UTF-16 node coordinates. A proposal
carries its `groupId` and the `changeIds` of the changes that contain its edits.
Use `changes`, never a diagnostic's `replacement`, to build native edits.
`preview` shows every group applied; it is display data, and replacing whole
native text nodes can destroy formatting.

A group is the unit of acceptance. Its changes are applied together, and the
changes of any set of groups of one plan apply without conflict. A group whose
proposals cancel each other has no change; present its diagnostics as
contradictory. Partial acceptance covers whole groups of the current plan, never
isolated changes: `validateDocumentPlan` takes the accepted groups as the
original objects of that plan, each at most once, and rejects copies,
duplicates, and groups of another plan. The batch lists the accepted groups and,
for each changed run, its changes and resulting nodes.

To decline a proposal, pass it in the `dismissed` option of the next
`prepareDocumentPlan` call, designated by `runId`, `ruleId`, and the
`segmentId`, `start`, and `end` that the previous plan reported. The core
recomputes the cascade without it and reports it with `dismissed: true` and no
group. The application keeps its dismissals and updates their ranges when the
document changes; a dismissal naming an unknown run is rejected. Prepare a new
plan after each commit: grouping covers local dependencies between rules, not
distant ones, so a new pass shows proposals that became necessary or obsolete.

Plans and batches are nominal opaque values as well as detached and deeply
frozen objects. Keep the originals in the same module session: cloned, filtered,
reconstructed, or deserialized values are rejected. Plan persistence is
deliberately outside this API.

Validation checks document identity, revision, and the full extracted context:
run and node order, IDs, locale, text, and protection. It also revalidates the
accepted changes through core. No document is modified by either function.
Accepting no group, or only groups without changes, produces an empty batch. All
changed runs of a batch form one indivisible transaction.

## In-memory reference adapter

```ts
import { createMemoryDocument } from "@orthotypography/editor-sdk";

const document = createMemoryDocument(source);
const snapshot = document.read();
const plan = prepareDocumentPlan(snapshot, IMPRIMERIE_NATIONALE_RULES);
const batch = validateDocumentPlan(
  plan,
  snapshot,
  plan.runs.flatMap((run) => run.groups),
);
const corrected = document.commit(batch);
```

`commit` accepts only original batches from this module session and rechecks the
plan and its accepted groups against the current state. It stages all runs
before swapping the state synchronously, so a failure leaves the document
unchanged. A nonempty batch advances the revision once; an empty batch preserves
it but still checks for conflicts. Read snapshots are deeply frozen and detached
from caller input.

Use `document.replaceRuns(expectedRevision, runs)` to simulate external text,
structure, language, or protection edits between validation and commit. Every
successful replacement advances the revision, even if the original text is
restored. A stale batch must be replaced with a fresh plan. Revisions are opaque
and unique within one adapter lifetime; do not use separate instances as writers
for the same document.

This adapter models extracted text only. Its synchronous state swap demonstrates
atomicity within one JavaScript instance; it does not implement native
formatting, selections, undo, persistence, or coordination between workers or
processes.

## Adapter responsibilities

An initial [Google Docs request compiler](../../docs/google-docs-preview.md) is
available through the `google-docs.ts` entry point. It produces review-only
native request payloads from caller-supplied body-text ranges. The companion
`extractGoogleDocsBody` function extracts plain body paragraphs and ranges from
a full Google Docs GET response, including nested tabs. It requires
`SUGGESTIONS_INLINE`, rejects suggestions and unsupported body structures, and
takes an explicit locale. Neither module performs network requests. Raw text
styles are retained on native ranges, outside the editor-neutral snapshot. Both
compilers take the accepted groups and compile only their changes.
`previewGoogleDocsStyledRequests` additionally restores source-node styles on
interior insertions using an explicit reset mask. This opt-in mode requires
style metadata for every range and rejects links, unsupported properties,
ambiguous insertions, and paragraph-edge insertions. Its behavior is tested with
synthetic request replay and a
[limited live Google Docs validation](../../docs/google-docs-live-validation.md)
covering nested tabs, mixed styles, UTF-16 offsets, idempotence, and
stale-revision rejection. This is not a general style-preservation guarantee.
The original text-only preview remains unchanged.

`normalizeGoogleDocsDocument` composes the extractor and either request compiler
behind a minimal asynchronous transport interface. The host must provide
complete inline-suggestions reads and map its provider responses to the explicit
write result categories. The orchestrator:

- reads and extracts once, prepares one plan, accepts every group, and writes
  the resulting request batch once with the original required revision;
- returns `revision-conflict` without retrying or reconstructing the stale plan;
- throws `GoogleDocsTransportFailure` for classified permission,
  invalid-request, transient, and unknown failures;
- performs one complete readback after a reported success and throws
  `GoogleDocsReadbackError` unless document identity, revision, paragraph text,
  tab placement, and (in styled mode) source styles reproduce the accepted
  groups;
- skips both the write and second read when the accepted groups change nothing.

The interface contains no HTTP client, OAuth flow, provider error parser, retry
policy, or connector-specific response conversion. In particular, an adapter for
a flattened connector response must reconstruct and validate native tab topology
before returning it from `read`.

`createGoogleDocsRestTransport` is the isolated Google Docs v1 implementation.
It uses an injected `getAccessToken` callback and an injectable
standards-compatible `fetch`; it does not acquire, refresh, store, or log
credentials. Reads request complete tab content with inline suggestions. Writes
send the compiler requests and `requiredRevisionId` unchanged to
`documents.batchUpdate`. HTTP 401/403 responses become permission failures,
408/429/5xx responses become transient failures, and other 400 responses become
invalid requests. The live-observed Google `INVALID_ARGUMENT` response is
recognized as a revision conflict only when its message states that the required
revision does not match the latest revision. Unknown or changed provider error
shapes remain `unknown` or `invalid-request`; they are never guessed to be safe
conflicts. Network failures are classified without exposing their raw diagnostic
messages.

```ts
import { IMPRIMERIE_NATIONALE_RULES } from "@orthotypography/core";
import {
  createGoogleDocsRestTransport,
  normalizeGoogleDocsDocument,
} from "@orthotypography/editor-sdk/google-docs";

const transport = createGoogleDocsRestTransport({
  // Credential acquisition and refresh remain application responsibilities.
  getAccessToken: () => applicationAccessToken,
});
const result = await normalizeGoogleDocsDocument(
  transport,
  documentId,
  "fr-FR",
  IMPRIMERIE_NATIONALE_RULES,
  { preserveStyles: true },
);
if (result.status === "revision-conflict") {
  // Ask the user to review a newly prepared plan; never replay this one.
}
```

Calling `normalizeGoogleDocsDocument` authorizes the transport to write every
group of the prepared plan when it is nonempty. Applications that require human
review can separate the two phases and accept whole groups without
reconstructing any SDK object:

```ts
import {
  commitGoogleDocsReview,
  discardGoogleDocsReview,
  prepareGoogleDocsReview,
} from "@orthotypography/editor-sdk/google-docs";

const review = await prepareGoogleDocsReview(
  transport,
  documentId,
  "fr-FR",
  IMPRIMERIE_NATIONALE_RULES,
  // Proposals the user declined earlier, kept by the application.
  { preserveStyles: true, dismissed },
);
// Display review.plan diagnostics, groups, and preview; this has not written.
// review.mode discriminates text-only and style-preserving request payloads.
if (acceptedGroups.length > 0) {
  // Original group objects of review.plan, selected by the user.
  const outcome = await commitGoogleDocsReview(
    transport,
    review,
    acceptedGroups,
  );
  // outcome.committed holds the requests written for outcome.accepted.
} else {
  discardGoogleDocsReview(transport, review);
}
```

`review.preview` compiles every group; a commit compiles only the accepted
groups, writes them once under the revision that was read, and verifies the
readback against them. An invalid selection is rejected before the review is
consumed. Only the original frozen review object can be committed, with the same
transport instance that read it. A review is consumed before its single write
attempt: success, conflict, failure, and concurrent calls cannot cause it to be
replayed. Cloned, reconstructed, deserialized, or already consumed reviews are
rejected. The review type is nominal, so ordinary TypeScript code cannot
reconstruct it structurally. Explicitly discard a rejected or closed review to
make that decision irreversible in the current module session. The server-side
revision condition remains authoritative if the document changes while the user
is reviewing.

Every review exposes a stable `mode` discriminant. `"text"` contains only delete
and insert requests; `"preserve-styles"` may additionally contain supported
style restoration requests. Consumers should narrow on this field rather than
infer the payload shape from application state. Literal `preserveStyles` options
also select precise return types for preparation and immediate normalization,
and committing a review preserves its mode in the result type.

- Read text and its revision consistently. Advance the revision for relevant
  text, structure, formatting, language, and protection changes, including
  undo/redo.
- Maintain the mapping from `(runId, segmentId)` to native ranges. Offsets are
  UTF-16, half-open, and measured against the original text.
- Translate every edit before writing. Changes within each run are sorted by
  descending segment index and offset. For editors with global offsets,
  establish a safe global order across runs; the SDK does not know native range
  semantics.
- Recheck `expectedRevision` **inside** an atomic native transaction or use the
  host's equivalent conditional batch API. Validation alone cannot close the
  race between reading the snapshot and writing. Also verify native ranges and
  expected text as required by the host. Reject the entire batch on conflict.
- Preserve styles, structure, selections, and undo semantics. Never commit a
  subset of a batch or retry a stale batch; obtain a new snapshot and prepare a
  new plan.

If the host cannot guarantee an atomic conditional commit, this contract
supports preview and diagnostics only until the adapter supplies an equivalent
mechanism. The in-memory reference adapter and the `./google-docs` entry point
implement this contract.

## Development

From this directory:

```sh
deno task check
deno task test
```

The independent configuration and CI job do not alter the released packages'
builds, dependency versions, or publishing workflow.
