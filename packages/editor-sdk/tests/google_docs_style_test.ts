import assert from "node:assert/strict";
import {
  IMPRIMERIE_NATIONALE_PUNCTUATION_RULES as rules,
} from "@orthotypography/core";
import { prepareDocumentPlan } from "../src/mod.ts";
import { allGroups, syntheticRule } from "./helpers.ts";
import { extractGoogleDocsBody } from "../src/google-docs-extract.ts";
import { previewGoogleDocsRequests } from "../src/google-docs.ts";
import {
  GOOGLE_DOCS_STYLE_FIELDS,
  previewGoogleDocsStyledRequests,
} from "../src/google-docs-style.ts";

function fixture(style: Record<string, unknown> = {}) {
  const response = {
    documentId: "d",
    revisionId: "r",
    suggestionsViewMode: "SUGGESTIONS_INLINE",
    tabs: [{
      tabProperties: { tabId: "t" },
      documentTab: {
        body: {
          content: [
            { endIndex: 1, sectionBreak: {} },
            {
              startIndex: 1,
              endIndex: 16,
              paragraph: {
                elements: [
                  {
                    startIndex: 1,
                    endIndex: 9,
                    textRun: { content: "Bonjour ", textStyle: { bold: true } },
                  },
                  {
                    startIndex: 9,
                    endIndex: 16,
                    textRun: { content: ":suite\n", textStyle: style },
                  },
                ],
              },
            },
          ],
        },
      },
    }],
  };
  return { response, ...extractGoogleDocsBody(response, "fr-FR") };
}

Deno.test("styled preview restores source-node styles after each insertion", () => {
  const { snapshot, ranges } = fixture({ italic: true, bold: false });
  const plan = prepareDocumentPlan(snapshot, rules);
  const styled = previewGoogleDocsStyledRequests(
    plan,
    snapshot,
    ranges,
    allGroups(plan),
  );
  assert.deepEqual(
    styled.body.requests.filter((r) => !("updateTextStyle" in r)),
    previewGoogleDocsRequests(plan, snapshot, ranges, allGroups(plan)).body
      .requests,
  );
  let updates = 0;
  for (const [i, request] of styled.body.requests.entries()) {
    if (!("updateTextStyle" in request)) continue;
    updates++;
    const previous = styled.body.requests[i - 1];
    assert.ok("insertText" in previous);
    assert.equal(
      request.updateTextStyle.range.startIndex,
      previous.insertText.location.index,
    );
    assert.equal(
      request.updateTextStyle.range.endIndex,
      previous.insertText.location.index + previous.insertText.text.length,
    );
    assert.deepEqual(request.updateTextStyle.textStyle, {
      italic: true,
      bold: false,
    });
    assert.equal(request.updateTextStyle.fields, GOOGLE_DOCS_STYLE_FIELDS);
  }
  assert.ok(updates > 0);
});

Deno.test("styled preview explicitly resets inherited styles and link state", () => {
  const { snapshot, ranges } = fixture();
  const plan = prepareDocumentPlan(snapshot, rules);
  const result = previewGoogleDocsStyledRequests(
    plan,
    snapshot,
    ranges,
    allGroups(plan),
  );
  const update = result.body.requests.find((r) => "updateTextStyle" in r)!;
  assert.ok("updateTextStyle" in update);
  assert.deepEqual(update.updateTextStyle.textStyle, {});
  assert.ok(update.updateTextStyle.fields.split(",").includes("bold"));
  assert.ok(update.updateTextStyle.fields.split(",").includes("link"));
});

Deno.test("styled request replay preserves text and node styles across offset shifts", () => {
  const { snapshot, ranges } = fixture({ italic: true });
  const plan = prepareDocumentPlan(snapshot, rules);
  const preview = previewGoogleDocsStyledRequests(
    plan,
    snapshot,
    ranges,
    allGroups(plan),
  );
  const characters: { text: string; style: unknown }[] = [{
    text: "\n",
    style: {},
  }];
  for (const [i, node] of snapshot.runs[0].nodes.entries()) {
    characters.push(
      ...node.value.split("").map((text) => ({
        text,
        style: ranges[i].textStyle,
      })),
    );
  }
  characters.push({ text: "\n", style: {} });
  for (const request of preview.body.requests) {
    if ("deleteContentRange" in request) {
      const r = request.deleteContentRange.range;
      characters.splice(r.startIndex, r.endIndex - r.startIndex);
    } else if ("insertText" in request) {
      const { location, text } = request.insertText;
      const inherited = characters[location.index - 1].style;
      characters.splice(
        location.index,
        0,
        ...text.split("").map((text) => ({ text, style: inherited })),
      );
    } else {
      const { range, textStyle } = request.updateTextStyle;
      for (let i = range.startIndex; i < range.endIndex; i++) {
        characters[i].style = textStyle;
      }
    }
  }
  const expected = plan.runs[0].preview.flatMap((node, i) =>
    node.value.split("").map((text) => ({ text, style: ranges[i].textStyle }))
  );
  assert.deepEqual(characters, [{ text: "\n", style: {} }, ...expected, {
    text: "\n",
    style: {},
  }]);
});

Deno.test("extracted and generated styles are deeply frozen and detached", () => {
  const style = {
    foregroundColor: { color: { rgbColor: { red: 0.2 } } },
    fontSize: { magnitude: 12, unit: "PT" },
    weightedFontFamily: { fontFamily: "Arial", weight: 400 },
  };
  const { snapshot, ranges } = fixture(style);
  style.foregroundColor.color.rgbColor.red = 0.9;
  const plan = prepareDocumentPlan(snapshot, rules);
  const preview = previewGoogleDocsStyledRequests(
    plan,
    snapshot,
    ranges,
    allGroups(plan),
  );
  const update = preview.body.requests.find((r) => "updateTextStyle" in r)!;
  assert.ok("updateTextStyle" in update);
  assert.deepEqual(update.updateTextStyle.textStyle.foregroundColor, {
    color: { rgbColor: { red: 0.2 } },
  });
  assert.ok(Object.isFrozen(update.updateTextStyle.textStyle.fontSize));
  assert.ok(Object.isFrozen(ranges[1].textStyle));
});

Deno.test("styled preview rejects missing metadata, links and unknown styles", () => {
  for (
    const style of [
      { link: { url: "https://example.com" } },
      { unsupported: true },
      { bold: "yes" },
      { fontSize: { magnitude: -1, unit: "PT" } },
      { foregroundColor: { color: { rgbColor: { red: 2 } } } },
    ]
  ) {
    const { snapshot, ranges } = fixture(style);
    const plan = prepareDocumentPlan(snapshot, rules);
    assert.throws(
      () =>
        previewGoogleDocsStyledRequests(
          plan,
          snapshot,
          ranges,
          allGroups(plan),
        ),
      /Google Docs/,
    );
    assert.doesNotThrow(() =>
      previewGoogleDocsRequests(plan, snapshot, ranges, allGroups(plan))
    );
  }
  const { snapshot, ranges } = fixture();
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.throws(
    () =>
      previewGoogleDocsStyledRequests(
        plan,
        snapshot,
        ranges.map((r) => ({ ...r, textStyle: undefined })),
        allGroups(plan),
      ),
    /Missing/,
  );
});

Deno.test("styled preview rejects paragraph boundaries including after earlier deletions", () => {
  for (
    const edits of [
      [{ start: 0, end: 1, replacement: "A" }],
      [{ start: 2, end: 3, replacement: "C" }],
      [{ start: 1, end: 2, replacement: "B" }, {
        start: 2,
        end: 3,
        replacement: "",
      }],
    ]
  ) {
    const snapshot = {
      documentId: "d",
      revision: "r",
      runs: [{ id: "p", locale: "fr-FR", nodes: [{ id: "n", value: "abc" }] }],
    };
    const rule = syntheticRule(edits);
    const plan = prepareDocumentPlan(snapshot, [rule]);
    const ranges = [{
      runId: "p",
      nodeId: "n",
      tabId: "t",
      startIndex: 1,
      endIndex: 4,
      textStyle: {},
    }];
    assert.throws(
      () =>
        previewGoogleDocsStyledRequests(
          plan,
          snapshot,
          ranges,
          allGroups(plan),
        ),
      /paragraph boundary/,
    );
  }
});

Deno.test("styled preview revalidates revisions and leaves empty plans empty", () => {
  const { snapshot, ranges } = fixture();
  const plan = prepareDocumentPlan(snapshot, []);
  assert.deepEqual(
    previewGoogleDocsStyledRequests(plan, snapshot, ranges, allGroups(plan))
      .body.requests,
    [],
  );
  assert.throws(
    () =>
      previewGoogleDocsStyledRequests(
        plan,
        { ...snapshot, revision: "new" },
        ranges,
        allGroups(plan),
      ),
    /Stale/,
  );
});
