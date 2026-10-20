# `@orthotypography/editor-sdk`

A JavaScript-compatible foundation for document editor adapters. It prepares
immutable correction plans and validates their complete source before a native
editor transaction. The module contains no editor API or Deno runtime
dependency.

This is an alpha release. Its API may change before `1.0.0`. It uses
`@orthotypography/core@0.2.0-alpha.0`.

The package exposes a single, editor-neutral entry point. Versions up to
`0.2.0-alpha.0` also shipped a `./google-docs` entry point, which is no longer
part of this package. It uses an independent version from the Astro
integrations. The
[packaging note](https://github.com/orthotypography/orthotypography-integrations/blob/main/docs/editor-sdk-packaging-v0.1.md)
records that decision.

## Installation

```sh
npm install @orthotypography/editor-sdk
```

With Deno or another JSR client:

```sh
deno add jsr:@orthotypography/editor-sdk@0.2.0-alpha.0
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

An adapter for a native editor must:

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
mechanism. The in-memory reference adapter implements this contract.

## Development

From this directory:

```sh
deno task check
deno task test
```

The independent configuration and CI job do not alter the released packages'
builds, dependency versions, or publishing workflow.
