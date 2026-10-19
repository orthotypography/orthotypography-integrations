import assert from "node:assert/strict";
import {
  IMPRIMERIE_NATIONALE_PUNCTUATION_RULES as rules,
} from "@orthotypography/core";
import { type DocumentSnapshot, prepareDocumentPlan } from "../src/mod.ts";
import { allGroups, syntheticRule } from "./helpers.ts";
import {
  type GoogleDocsNodeRange,
  previewGoogleDocsRequests,
} from "../src/google-docs.ts";

function fixture() {
  const source: DocumentSnapshot = {
    documentId: "doc",
    revision: "google-revision",
    runs: [
      { id: "later", locale: "fr-FR", nodes: [{ id: "n", value: "Bravo !" }] },
      {
        id: "earlier",
        locale: "fr-FR",
        nodes: [{ id: "a", value: "😀 Bonjour " }, {
          id: "b",
          value: ":suite",
        }],
      },
      {
        id: "other-tab",
        locale: "fr-FR",
        nodes: [{ id: "n", value: "Salut !" }],
      },
    ],
  };
  const ranges: GoogleDocsNodeRange[] = [
    {
      runId: "later",
      nodeId: "n",
      tabId: "tab-a",
      startIndex: 20,
      endIndex: 27,
    },
    {
      runId: "earlier",
      nodeId: "a",
      tabId: "tab-a",
      startIndex: 1,
      endIndex: 12,
    },
    {
      runId: "earlier",
      nodeId: "b",
      tabId: "tab-a",
      startIndex: 12,
      endIndex: 18,
    },
    {
      runId: "other-tab",
      nodeId: "n",
      tabId: "tab-b",
      startIndex: 1,
      endIndex: 8,
    },
  ];
  return { source, ranges, plan: prepareDocumentPlan(source, rules) };
}

Deno.test("Google Docs requests reproduce previews across nodes, runs and tabs", () => {
  const { source, ranges, plan } = fixture();
  const preview = previewGoogleDocsRequests(
    plan,
    source,
    ranges,
    allGroups(plan),
  );
  const texts = new Map([["tab-a", "\n😀 Bonjour :suite\n\nBravo !\n"], [
    "tab-b",
    "\nSalut !\n",
  ]]);
  const expected = new Map(texts);
  // Independent oracle: replace complete source runs in descending native order.
  for (const index of [0, 1, 2]) {
    const run = source.runs[index];
    const range = ranges.find((r) => r.runId === run.id)!;
    const text = expected.get(range.tabId)!;
    const length = run.nodes.reduce((n, node) => n + node.value.length, 0);
    expected.set(
      range.tabId,
      text.slice(0, range.startIndex) + plan.runs[index].preview.map((n) =>
        n.value
      ).join("") + text.slice(range.startIndex + length),
    );
  }
  for (const request of preview.body.requests) {
    if ("deleteContentRange" in request) {
      const r = request.deleteContentRange.range;
      const text = texts.get(r.tabId)!;
      texts.set(r.tabId, text.slice(0, r.startIndex) + text.slice(r.endIndex));
    } else {
      const { location, text } = request.insertText;
      const previous = texts.get(location.tabId)!;
      texts.set(
        location.tabId,
        previous.slice(0, location.index) + text +
          previous.slice(location.index),
      );
    }
  }
  assert.deepEqual(texts, expected);
  assert.deepEqual(preview.body.writeControl, {
    requiredRevisionId: source.revision,
  });
  assert.equal(preview.documentId, source.documentId);
  assert.ok(Object.isFrozen(preview.body.requests[0]));
  assert.ok(Object.isFrozen(preview.body.writeControl));
});

Deno.test("Google Docs compiler rejects stale and reconstructed plans", () => {
  const { source, ranges, plan } = fixture();
  assert.throws(
    () =>
      previewGoogleDocsRequests(
        plan,
        { ...source, revision: "new" },
        ranges,
        allGroups(plan),
      ),
    /Stale/,
  );
  assert.throws(
    () =>
      previewGoogleDocsRequests(
        structuredClone(plan),
        source,
        ranges,
        allGroups(plan),
      ),
    /Unknown document plan/,
  );
});

Deno.test("Google Docs ranges must be complete, unique and length matched", () => {
  const { source, ranges, plan } = fixture();
  for (
    const invalid of [ranges.slice(1), [...ranges, ranges[0]], [{
      ...ranges[0],
      endIndex: 28,
    }, ...ranges.slice(1)], [...ranges, { ...ranges[0], runId: "unknown" }]]
  ) {
    assert.throws(
      () => previewGoogleDocsRequests(plan, source, invalid, allGroups(plan)),
      /Missing|Duplicate|Unknown/,
    );
  }
});

Deno.test("Google Docs ranges reject invalid indexes and implicit tabs", () => {
  const { source, ranges, plan } = fixture();
  for (
    const replacement of [
      { startIndex: -1 },
      { startIndex: 0 },
      { startIndex: 1.5 },
      { endIndex: Infinity },
      { tabId: "" },
    ]
  ) {
    assert.throws(
      () =>
        previewGoogleDocsRequests(plan, source, [{
          ...ranges[0],
          ...replacement,
        }, ...ranges.slice(1)], allGroups(plan)),
      /Invalid/,
    );
  }
});

Deno.test("Google Docs compiler rejects overlapping and discontinuous ranges", () => {
  const { source, ranges, plan } = fixture();
  assert.throws(
    () =>
      previewGoogleDocsRequests(plan, source, [{
        ...ranges[0],
        startIndex: 5,
        endIndex: 12,
      }, ...ranges.slice(1)], allGroups(plan)),
    /Overlapping/,
  );
  for (
    const replacement of [{ tabId: "different" }, {
      startIndex: 13,
      endIndex: 19,
    }]
  ) {
    const copy = [...ranges];
    copy[2] = { ...copy[2], ...replacement };
    assert.throws(
      () => previewGoogleDocsRequests(plan, source, copy, allGroups(plan)),
      /contiguous/,
    );
  }
});

Deno.test("Google Docs compiler excludes paragraph boundaries and inline objects", () => {
  for (const value of ["text\n", "text\r", "text\ufffc", "text\ud800"]) {
    const source = {
      documentId: "d",
      revision: "r",
      runs: [{ id: "p", locale: "fr-FR", nodes: [{ id: "n", value }] }],
    };
    const plan = prepareDocumentPlan(source, []);
    assert.throws(
      () =>
        previewGoogleDocsRequests(plan, source, [{
          runId: "p",
          nodeId: "n",
          tabId: "t",
          startIndex: 1,
          endIndex: 1 + value.length,
        }], allGroups(plan)),
      /Unsupported/,
    );
  }
});

Deno.test("Google Docs compiler rejects text stripped or structurally changed by insertion", () => {
  const source = {
    documentId: "d",
    revision: "r",
    runs: [{ id: "p", locale: "fr-FR", nodes: [{ id: "n", value: "x" }] }],
  };
  for (const replacement of ["\n", "\u0000", "\ue000", "\ufffc", "\ud800"]) {
    const rule = syntheticRule([{ start: 0, end: 1, replacement }]);
    const plan = prepareDocumentPlan(source, [rule]);
    assert.throws(
      () =>
        previewGoogleDocsRequests(plan, source, [{
          runId: "p",
          nodeId: "n",
          tabId: "t",
          startIndex: 1,
          endIndex: 2,
        }], allGroups(plan)),
      /Unsupported/,
    );
  }
});

Deno.test("Google Docs empty corrections return no operations", () => {
  const source = { documentId: "d", revision: "r", runs: [] };
  assert.deepEqual(
    previewGoogleDocsRequests(
      prepareDocumentPlan(source, rules),
      source,
      [],
      [],
    )
      .body.requests,
    [],
  );
});

Deno.test("Google Docs protected text never receives native requests", () => {
  const source = {
    documentId: "d",
    revision: "r",
    runs: [{
      id: "p",
      locale: "fr-FR",
      nodes: [{ id: "n", value: "Bonjour !", protected: true }],
    }],
  };
  const plan = prepareDocumentPlan(source, rules);
  const preview = previewGoogleDocsRequests(plan, source, [{
    runId: "p",
    nodeId: "n",
    tabId: "t",
    startIndex: 1,
    endIndex: 10,
  }], allGroups(plan));
  assert.deepEqual(preview.body.requests, []);
});

Deno.test("Google Docs refuses a correction splitting an astral character", () => {
  const source = {
    documentId: "d",
    revision: "r",
    runs: [{ id: "p", locale: "fr-FR", nodes: [{ id: "n", value: "😀" }] }],
  };
  const rule = syntheticRule([{ start: 1, end: 2, replacement: "\ude01" }]);
  const plan = prepareDocumentPlan(source, [rule]);
  assert.throws(
    () =>
      previewGoogleDocsRequests(plan, source, [{
        runId: "p",
        nodeId: "n",
        tabId: "t",
        startIndex: 1,
        endIndex: 3,
      }], allGroups(plan)),
    /Unsupported/,
  );
});
