import assert from "node:assert/strict";
import { IMPRIMERIE_NATIONALE_PUNCTUATION_RULES as rules } from "@orthotypography/core";
import { prepareDocumentPlan } from "../src/mod.ts";
import { allGroups } from "./helpers.ts";
import { previewGoogleDocsRequests } from "../src/google-docs.ts";
import { extractGoogleDocsBody } from "../src/google-docs-extract.ts";

function paragraph(start: number, texts: string[]) {
  let cursor = start;
  const elements = texts.map((content) => {
    const startIndex = cursor;
    cursor += content.length;
    return {
      startIndex,
      endIndex: cursor,
      textRun: { content, textStyle: { bold: true } },
    };
  });
  return { startIndex: start, endIndex: cursor, paragraph: { elements } };
}
function tab(tabId: string) {
  return {
    tabProperties: { tabId },
    documentTab: {
      body: {
        content: [
          { endIndex: 1, sectionBreak: {} },
          paragraph(1, ["😀 Bonjour ", ":suite\n"]),
          paragraph(19, ["\n"]),
        ],
      },
    },
  };
}
function fixture() {
  return {
    documentId: "doc",
    revisionId: "rev",
    suggestionsViewMode: "SUGGESTIONS_INLINE",
    tabs: [tab("root")],
  };
}

Deno.test("Google Docs extraction connects a GET fixture to native request preview", () => {
  const response = fixture();
  const original = structuredClone(response);
  const { snapshot, ranges } = extractGoogleDocsBody(response, "fr-FR");
  assert.deepEqual(response, original);
  assert.deepEqual(snapshot.runs.map((r) => r.nodes.map((n) => n.value)), [[
    "😀 Bonjour ",
    ":suite",
  ], []]);
  assert.deepEqual(ranges.map((r) => [r.startIndex, r.endIndex]), [[1, 12], [
    12,
    18,
  ]]);
  const plan = prepareDocumentPlan(snapshot, rules);
  const preview = previewGoogleDocsRequests(
    plan,
    snapshot,
    ranges,
    allGroups(plan),
  );
  let body = "\n😀 Bonjour :suite\n\n";
  for (const request of preview.body.requests) {
    if ("deleteContentRange" in request) {
      const r = request.deleteContentRange.range;
      body = body.slice(0, r.startIndex) + body.slice(r.endIndex);
    } else {
      const { location, text } = request.insertText;
      body = body.slice(0, location.index) + text + body.slice(location.index);
    }
  }
  assert.equal(body, "\n😀 Bonjour\u00a0: suite\n\n");
  assert.equal(snapshot.revision, "rev");
  assert.equal(snapshot.documentId, "doc");
  assert.ok(Object.isFrozen(snapshot.runs[0].nodes[0]));
  assert.ok(Object.isFrozen(ranges[0]));
});

Deno.test("Google Docs nested tabs have independent native coordinates and unique run IDs", () => {
  const response = {
    ...fixture(),
    tabs: [{ ...tab("root"), childTabs: [tab("child")] }, tab("sibling")],
  };
  const { snapshot, ranges } = extractGoogleDocsBody(response, "fr-FR");
  assert.equal(snapshot.runs.length, 6);
  assert.equal(new Set(snapshot.runs.map((r) => r.id)).size, 6);
  assert.deepEqual([...new Set(ranges.map((r) => r.tabId))], [
    "root",
    "child",
    "sibling",
  ]);
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.doesNotThrow(() =>
    previewGoogleDocsRequests(plan, snapshot, ranges, allGroups(plan))
  );
  Object.assign(response.tabs[0], { childTabs: [tab("root")] });
  assert.throws(() => extractGoogleDocsBody(response, "fr-FR"), /Duplicate/);
});

Deno.test("Google Docs extraction rejects missing revision, tabs and incompatible views", () => {
  for (
    const extra of [{ revisionId: "" }, { documentId: "" }, { tabs: [] }, {
      tabs: undefined,
    }, { suggestionsViewMode: "PREVIEW_WITHOUT_SUGGESTIONS" }]
  ) {
    assert.throws(() =>
      extractGoogleDocsBody({ ...fixture(), ...extra }, "fr-FR")
    );
  }
  assert.throws(() => extractGoogleDocsBody(fixture(), " "), /locale/);
});

Deno.test("Google Docs extraction rejects suggestions in text and styles", () => {
  for (
    const extra of [{ suggestedInsertionIds: ["s"] }, {
      suggestedDeletionIds: ["s"],
    }, { suggestedTextStyleChanges: { s: {} } }]
  ) {
    const p = paragraph(1, ["text\n"]);
    Object.assign(p.paragraph.elements[0].textRun, extra);
    const response = fixture();
    response.tabs[0].documentTab.body.content = [{
      endIndex: 1,
      sectionBreak: {},
    }, p];
    assert.throws(
      () => extractGoogleDocsBody(response, "fr-FR"),
      /suggestions/,
    );
  }
});

Deno.test("Google Docs extraction rejects unsupported body structures and inline objects", () => {
  for (
    const body of [{ startIndex: 1, endIndex: 4, table: {} }, {
      startIndex: 1,
      endIndex: 4,
      tableOfContents: {},
    }, {
      startIndex: 1,
      endIndex: 2,
      paragraph: {
        elements: [{
          startIndex: 1,
          endIndex: 2,
          inlineObjectElement: { inlineObjectId: "x" },
        }],
      },
    }]
  ) {
    const response = {
      ...fixture(),
      tabs: [{
        tabProperties: { tabId: "t" },
        documentTab: {
          body: { content: [{ endIndex: 1, sectionBreak: {} }, body] },
        },
      }],
    };
    assert.throws(
      () => extractGoogleDocsBody(response, "fr-FR"),
      /Unsupported/,
    );
  }
});

Deno.test("Google Docs extraction rejects malformed indexes, gaps and missing terminators", () => {
  for (
    const p of [
      paragraph(2, ["text\n"]),
      paragraph(1, ["text"]),
      paragraph(1, ["a\nb\n"]),
      paragraph(1, ["\ud800\n"]),
    ]
  ) {
    const response = fixture();
    response.tabs[0].documentTab.body.content = [{
      endIndex: 1,
      sectionBreak: {},
    }, p];
    assert.throws(() => extractGoogleDocsBody(response, "fr-FR"));
  }
  const response = fixture();
  const p = paragraph(1, ["text\n"]);
  p.paragraph.elements[0].endIndex++;
  response.tabs[0].documentTab.body.content = [{
    endIndex: 1,
    sectionBreak: {},
  }, p];
  assert.throws(() => extractGoogleDocsBody(response, "fr-FR"), /range/);
});

Deno.test("Google Docs newline-only final text run creates no empty mapped node", () => {
  const response = fixture();
  response.tabs[0].documentTab.body.content = [{
    endIndex: 1,
    sectionBreak: {},
  }, paragraph(1, ["Bonjour !", "\n"])];
  const { snapshot, ranges } = extractGoogleDocsBody(response, "fr-FR");
  assert.equal(snapshot.runs[0].nodes.length, 1);
  assert.equal(ranges[0].endIndex, 10);
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.doesNotThrow(() =>
    previewGoogleDocsRequests(plan, snapshot, ranges, allGroups(plan))
  );
});

Deno.test("Google Docs extracted snapshots are detached from input edits", () => {
  const response = fixture();
  const result = extractGoogleDocsBody(response, "fr-FR");
  response.revisionId = "new";
  response.tabs[0].documentTab.body.content = [];
  assert.equal(result.snapshot.revision, "rev");
  assert.equal(result.snapshot.runs.length, 2);
});
