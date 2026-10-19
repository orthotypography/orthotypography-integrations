import assert from "node:assert/strict";
import { IMPRIMERIE_NATIONALE_PUNCTUATION_RULES as rules } from "@orthotypography/core";
import { extractGoogleDocsBody } from "../src/google-docs-extract.ts";
import { prepareDocumentPlan } from "../src/mod.ts";
import { allGroups } from "./helpers.ts";
import { previewGoogleDocsStyledRequests } from "../src/google-docs-style.ts";
import { after, before } from "./fixtures/google_docs_live.ts";

Deno.test("live Google Docs readback matches planned text and every source style", () => {
  const source = extractGoogleDocsBody(before, "fr-FR");
  const observed = extractGoogleDocsBody(after, "fr-FR");
  const plan = prepareDocumentPlan(source.snapshot, rules);
  const preview = previewGoogleDocsStyledRequests(
    plan,
    source.snapshot,
    source.ranges,
    allGroups(plan),
  );
  // The live run used core 0.1.0-alpha.2, whose eight changes produced 24
  // requests. Core 0.1.0-alpha.3 reports the space after an exclamation mark as
  // a separate atomic change; the planned text still equals the live readback.
  assert.equal(preview.body.requests.length, 26);
  assert.equal(plan.runs.reduce((n, run) => n + run.changes.length, 0), 9);
  assert.equal(observed.snapshot.runs.length, 5);
  for (const [i, run] of plan.runs.entries()) {
    const expected = run.preview.flatMap((node) => {
      const range = source.ranges.find((r) =>
        r.runId === run.id && r.nodeId === node.id
      )!;
      return node.value.split("").map((text) => ({
        text,
        style: range.textStyle,
        tab: range.tabId,
      }));
    });
    const actualRun = observed.snapshot.runs[i];
    const actual = actualRun.nodes.flatMap((node) => {
      const range = observed.ranges.find((r) =>
        r.runId === actualRun.id && r.nodeId === node.id
      )!;
      return node.value.split("").map((text) => ({
        text,
        style: range.textStyle,
        tab: range.tabId,
      }));
    });
    assert.deepEqual(actual, expected);
  }
});

Deno.test("live Google Docs corrected readback needs no further requests", () => {
  const { snapshot, ranges } = extractGoogleDocsBody(after, "fr-FR");
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.deepEqual(
    previewGoogleDocsStyledRequests(plan, snapshot, ranges, allGroups(plan))
      .body.requests,
    [],
  );
});
