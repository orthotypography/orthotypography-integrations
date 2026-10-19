import assert from "node:assert/strict";
import { IMPRIMERIE_NATIONALE_PUNCTUATION_RULES as rules } from "@orthotypography/core";
import {
  commitGoogleDocsReview,
  discardGoogleDocsReview,
  GoogleDocsReadbackError,
  type GoogleDocsReview,
  GoogleDocsReviewError,
  type GoogleDocsStyledReview,
  type GoogleDocsTextReview,
  type GoogleDocsTransport,
  GoogleDocsTransportFailure,
  normalizeGoogleDocsDocument,
  prepareGoogleDocsReview,
} from "../src/google-docs-transport.ts";
import { after, before } from "./fixtures/google_docs_live.ts";
import type { GoogleDocsTextRequest } from "../src/google-docs.ts";
import { allGroups, applyGoogleDocsTextRequests } from "./helpers.ts";

function transport(
  writeResult: Awaited<ReturnType<GoogleDocsTransport["write"]>> = { ok: true },
  readback: unknown = after,
) {
  const reads: unknown[] = [];
  const writes: unknown[] = [];
  const value: GoogleDocsTransport = {
    read(documentId, options) {
      reads.push({ documentId, options });
      return Promise.resolve(reads.length === 1 ? before : readback);
    },
    write(input) {
      writes.push(input);
      return Promise.resolve(writeResult);
    },
  };
  return { value, reads, writes };
}

Deno.test("review separates preparation from one explicit commit", async () => {
  const mock = transport();
  const review: GoogleDocsStyledReview = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
    { preserveStyles: true },
  );
  assert.equal(review.mode, "preserve-styles");
  assert.equal(mock.reads.length, 1);
  assert.equal(mock.writes.length, 0);
  assert.ok(Object.isFrozen(review));
  await assert.rejects(
    commitGoogleDocsReview(
      mock.value,
      structuredClone(review),
      allGroups(review.plan),
    ),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "unknown-review",
  );
  await assert.rejects(
    commitGoogleDocsReview(transport().value, review, allGroups(review.plan)),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "transport-mismatch",
  );
  const firstCommit = commitGoogleDocsReview(
    mock.value,
    review,
    allGroups(review.plan),
  );
  await assert.rejects(
    commitGoogleDocsReview(mock.value, review, allGroups(review.plan)),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "already-consumed",
  );
  const result = await firstCommit;
  const committedMode: "preserve-styles" = result.mode;
  assert.equal(committedMode, "preserve-styles");
  assert.equal(result.status, "applied");
  assert.equal(mock.reads.length, 2);
  assert.equal(mock.writes.length, 1);
});

Deno.test("review can be explicitly discarded without writing", async () => {
  const mock = transport();
  const review: GoogleDocsStyledReview = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
    { preserveStyles: true },
  );
  discardGoogleDocsReview(mock.value, review);
  assert.equal(mock.writes.length, 0);
  await assert.rejects(
    commitGoogleDocsReview(mock.value, review, allGroups(review.plan)),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "already-consumed",
  );
  assert.throws(
    () => discardGoogleDocsReview(mock.value, review),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "already-consumed",
  );
  assert.equal(mock.writes.length, 0);
});

Deno.test("review is nominal and cannot be reconstructed structurally", async () => {
  const mock = transport();
  const review: GoogleDocsTextReview = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
  );
  assert.equal(review.mode, "text");
  if (review.mode !== "text") assert.fail("Expected a text-only review");
  assert.ok(
    review.preview.body.requests.every((request) =>
      "deleteContentRange" in request || "insertText" in request
    ),
  );
  // @ts-expect-error reconstructed data is not an opaque GoogleDocsReview
  const reconstructed: GoogleDocsReview = {
    mode: "text",
    before: review.before,
    plan: review.plan,
    preview: review.preview,
  };
  await assert.rejects(
    commitGoogleDocsReview(
      mock.value,
      reconstructed,
      allGroups(reconstructed.plan),
    ),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "unknown-review",
  );
});

Deno.test("transport applies once with exact read and revision contracts", async () => {
  const mock = transport();
  const result = await normalizeGoogleDocsDocument(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
    { preserveStyles: true },
  );
  const normalizedMode: "preserve-styles" = result.mode;
  assert.equal(normalizedMode, "preserve-styles");
  assert.equal(result.status, "applied");
  assert.equal(mock.reads.length, 2);
  assert.deepEqual(mock.reads[0], {
    documentId: "live-fixture",
    options: {
      includeTabsContent: true,
      suggestionsViewMode: "SUGGESTIONS_INLINE",
    },
  });
  assert.equal(mock.writes.length, 1);
  assert.deepEqual(mock.writes[0], {
    documentId: "live-fixture",
    requests: result.preview.body.requests,
    requiredRevisionId: "before",
  });
  assert.equal(result.after.revision, "after");
});

Deno.test("transport returns revision conflicts without retry or readback", async () => {
  const mock = transport({ ok: false, kind: "revision-conflict" });
  const review = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
    { preserveStyles: true },
  );
  const result = await commitGoogleDocsReview(
    mock.value,
    review,
    allGroups(review.plan),
  );
  assert.equal(result.status, "revision-conflict");
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.reads.length, 1);
  await assert.rejects(
    commitGoogleDocsReview(mock.value, review, allGroups(review.plan)),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "already-consumed",
  );
  assert.equal(mock.writes.length, 1);
});

Deno.test("transport exposes classified non-conflict failures", async () => {
  const mock = transport({
    ok: false,
    kind: "permission",
    message: "denied",
  });
  await assert.rejects(
    normalizeGoogleDocsDocument(
      mock.value,
      "live-fixture",
      "fr-FR",
      rules,
      { preserveStyles: true },
    ),
    (error) =>
      error instanceof GoogleDocsTransportFailure &&
      error.kind === "permission" && error.message === "denied",
  );
  assert.equal(mock.reads.length, 1);
});

Deno.test("transport skips writes and readback for unchanged documents", async () => {
  const mock = transport();
  mock.value.read = (_documentId, _options) => Promise.resolve(after);
  const result = await normalizeGoogleDocsDocument(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
    { preserveStyles: true },
  );
  assert.equal(result.status, "unchanged");
  assert.equal(mock.writes.length, 0);
});

Deno.test("transport rejects successful writes with mismatched readback", async () => {
  const changed = structuredClone(after);
  changed.revisionId = "different";
  changed.tabs[0].documentTab.body.content[1].paragraph!.elements[0].textRun
    .content = "XX ";
  const mock = transport({ ok: true }, changed);
  await assert.rejects(
    normalizeGoogleDocsDocument(
      mock.value,
      "live-fixture",
      "fr-FR",
      rules,
      { preserveStyles: true },
    ),
    GoogleDocsReadbackError,
  );
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.reads.length, 2);
});

/** Transport whose readback applies the written text requests to `before`. */
function simulatedTransport() {
  const writes: Parameters<GoogleDocsTransport["write"]>[0][] = [];
  let reads = 0;
  const value: GoogleDocsTransport = {
    read() {
      reads++;
      return Promise.resolve(
        writes.length === 0 ? before : applyGoogleDocsTextRequests(
          before,
          writes[0].requests as readonly GoogleDocsTextRequest[],
          "partial",
        ),
      );
    },
    write(input) {
      writes.push(input);
      return Promise.resolve({ ok: true });
    },
  };
  return { value, writes, reads: () => reads };
}

Deno.test("review commits only the accepted groups and verifies their readback", async () => {
  const mock = simulatedTransport();
  const review = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
  );
  const runs = review.plan.runs.filter((run) => run.groups.length > 1);
  assert.ok(runs.length >= 2);
  // Accept the last group of each run, in reverse order.
  const accepted = runs.map((run) => run.groups[run.groups.length - 1])
    .reverse();
  const result = await commitGoogleDocsReview(mock.value, review, accepted);
  assert.equal(result.status, "applied");
  assert.deepEqual(result.accepted, [...accepted].reverse());
  assert.equal(mock.writes.length, 1);
  assert.deepEqual(mock.writes[0].requests, result.committed.body.requests);
  assert.ok(
    result.committed.body.requests.length <
      review.preview.body.requests.length,
  );
  if (result.status !== "applied") assert.fail("Expected an applied review");
  for (const [index, planned] of review.plan.runs.entries()) {
    const text = result.after.runs[index].nodes.map((n) => n.value).join("");
    const source = review.before.runs[index].nodes.map((n) => n.value).join(
      "",
    );
    if (runs.includes(planned)) {
      assert.notEqual(text, source);
      assert.notEqual(text, planned.preview.map((n) => n.value).join(""));
    } else {
      assert.equal(text, source);
    }
  }
});

Deno.test("a partial commit rejects a readback of every group", async () => {
  const mock = transport();
  const review = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
  );
  await assert.rejects(
    commitGoogleDocsReview(mock.value, review, [
      review.plan.runs[0].groups[0],
    ]),
    GoogleDocsReadbackError,
  );
  assert.equal(mock.writes.length, 1);
});

Deno.test("accepting no group consumes the review without writing", async () => {
  const mock = transport();
  const review = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
  );
  const result = await commitGoogleDocsReview(mock.value, review, []);
  assert.equal(result.status, "unchanged");
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.committed.body.requests, []);
  assert.equal(mock.writes.length, 0);
  assert.equal(mock.reads.length, 1);
  await assert.rejects(
    commitGoogleDocsReview(mock.value, review, []),
    (error) =>
      error instanceof GoogleDocsReviewError &&
      error.kind === "already-consumed",
  );
});

Deno.test("an invalid selection throws before the review is consumed", async () => {
  const mock = transport();
  const review = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
    { preserveStyles: true },
  );
  const group = review.plan.runs[0].groups[0];
  for (const accepted of [[{ ...group }], [group, group]]) {
    await assert.rejects(
      commitGoogleDocsReview(mock.value, review, accepted),
      /Unknown proposal group|Duplicate accepted group/,
    );
  }
  assert.equal(mock.writes.length, 0);
  const result = await commitGoogleDocsReview(
    mock.value,
    review,
    allGroups(review.plan),
  );
  assert.equal(result.status, "applied");
});

Deno.test("dismissed proposals are recomputed out of the review", async () => {
  const first = await prepareGoogleDocsReview(
    transport().value,
    "live-fixture",
    "fr-FR",
    rules,
  );
  const run = first.plan.runs[0];
  const target = run.diagnostics[run.groups[0].diagnostics[0]];
  const dismissal = {
    runId: run.id,
    ruleId: target.ruleId,
    segmentId: target.segmentId,
    start: target.start,
    end: target.end,
  };
  const mock = transport();
  const review = await prepareGoogleDocsReview(
    mock.value,
    "live-fixture",
    "fr-FR",
    rules,
    { dismissed: [dismissal] },
  );
  assert.deepEqual(review.plan.dismissed, [dismissal]);
  assert.equal(review.plan.runs[0].groups.length, run.groups.length - 1);
  assert.ok(
    review.plan.runs[0].diagnostics.some((d) =>
      d.dismissed === true && d.ruleId === target.ruleId
    ),
  );
  assert.ok(
    review.preview.body.requests.length < first.preview.body.requests.length,
  );
  discardGoogleDocsReview(mock.value, review);
});
