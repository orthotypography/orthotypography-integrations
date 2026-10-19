import assert from "node:assert/strict";
import {
  IMPRIMERIE_NATIONALE_RULES,
  type RuntimeRule,
  SAFE_PUNCTUATION_RULES,
  type TextChange,
} from "@orthotypography/core";
import {
  type AdapterDiagnostic,
  type AdapterPipelineResult,
  type AdapterTextNodeInput,
  type HastRoot,
  rehypeOrthotypography,
  type TextNodePipelineRunner,
} from "../src/mod.ts";

const testRule = {} as RuntimeRule;

Deno.test("adapter uses the core runner by default", () => {
  const tree: HastRoot = {
    type: "root",
    children: [{ type: "text", value: "Bonjour , monde." }],
  };

  rehypeOrthotypography({
    rules: SAFE_PUNCTUATION_RULES,
    locale: "fr-FR",
    mode: "fix",
  })(tree);

  assert.equal(tree.children[0].value, "Bonjour, monde.");
});

Deno.test("adapter exposes source-coordinate changes", () => {
  const tree: HastRoot = {
    type: "root",
    children: [{ type: "text", value: "Bonjour , monde." }],
  };
  const file = { data: {} as Record<string, unknown> };
  const observed: TextChange[] = [];

  rehypeOrthotypography({
    rules: SAFE_PUNCTUATION_RULES,
    locale: "fr-FR",
    mode: "fix",
    onChange: (change) => observed.push(change),
  })(tree, file);

  assert.equal(observed.length, 1);
  assert.equal(observed[0].segmentId, "0");
  assert.equal(observed[0].expected, " ,");
  assert.equal(observed[0].replacement, ",");
  assert.deepEqual(file.data.orthotypographyChanges, observed);
});

Deno.test("fix diagnostics stay located in the source text nodes", () => {
  const sources = ["Il dit «Quoi?» et paie ", "1200 €", "."];
  const tree: HastRoot = {
    type: "root",
    children: [{
      type: "element",
      tagName: "p",
      children: [
        { type: "text", value: sources[0] },
        {
          type: "element",
          tagName: "strong",
          children: [{ type: "text", value: sources[1] }],
        },
        { type: "text", value: sources[2] },
      ],
    }],
  };
  const reported: AdapterDiagnostic[] = [];

  rehypeOrthotypography({
    rules: IMPRIMERIE_NATIONALE_RULES,
    locale: "fr-FR",
    mode: "fix",
    onDiagnostic: (diagnostic) => reported.push(diagnostic),
  })(tree);

  const sourceById = new Map([
    ["0.0", sources[0]],
    ["0.1.0", sources[1]],
    ["0.2", sources[2]],
  ]);
  assert.ok(reported.length > 0);
  for (const diagnostic of reported) {
    assert.equal(
      diagnostic.segmentValue,
      sourceById.get(diagnostic.segmentId ?? ""),
    );
    assert.ok(0 <= diagnostic.start && diagnostic.start <= diagnostic.end);
    assert.ok(diagnostic.end <= diagnostic.segmentValue.length);
    assert.equal("coordinateSpace" in diagnostic, false);
  }
  assert.notEqual(tree.children[0].children?.[0].value, sources[0]);
});

function fixRunner(
  calls: AdapterTextNodeInput[][],
): TextNodePipelineRunner {
  return (nodes, _rules, options): AdapterPipelineResult => {
    calls.push(nodes.map((node) => ({ ...node })));
    return {
      value: nodes.map(({ value }) => value).join(""),
      nodes: nodes.map((node) => ({
        ...node,
        value: options.mode === "fix"
          ? node.value.replace("«", "«\u00a0").replace("»", "\u00a0»")
          : node.value,
      })),
      changes: [],
      diagnostics: [],
      appliedRuleIds: ["test"],
    };
  };
}

Deno.test("inline descendants form one logical text run", () => {
  const calls: AdapterTextNodeInput[][] = [];
  const tree: HastRoot = {
    type: "root",
    children: [{
      type: "element",
      tagName: "p",
      children: [
        { type: "text", value: "«bonjour " },
        {
          type: "element",
          tagName: "em",
          children: [{ type: "text", value: "monde" }],
        },
        { type: "text", value: "»" },
      ],
    }],
  };

  rehypeOrthotypography({
    runTextNodePipeline: fixRunner(calls),
    rules: [testRule],
    locale: "fr-FR",
    mode: "fix",
  })(tree);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map(({ id }) => id), ["0.0", "0.1.0", "0.2"]);
  assert.equal(tree.children[0].children?.[0].value, "«\u00a0bonjour ");
  assert.equal(tree.children[0].children?.[1].children?.[0].value, "monde");
  assert.equal(tree.children[0].children?.[2].value, "\u00a0»");
});

Deno.test("block and excluded subtrees are logical run boundaries", () => {
  const calls: AdapterTextNodeInput[][] = [];
  const tree: HastRoot = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        children: [
          { type: "text", value: "avant" },
          {
            type: "element",
            tagName: "code",
            children: [{ type: "text", value: "intouchable" }],
          },
          { type: "text", value: "après" },
        ],
      },
      {
        type: "element",
        tagName: "p",
        children: [{ type: "text", value: "autre bloc" }],
      },
    ],
  };

  rehypeOrthotypography({
    runTextNodePipeline: fixRunner(calls),
    rules: [testRule],
    locale: "fr-FR",
    mode: "fix",
  })(tree);

  assert.deepEqual(
    calls.map((run) => run.map(({ value }) => value)),
    [["avant"], ["après"], ["autre bloc"]],
  );
});

Deno.test("protected inline content stays inside its logical run", () => {
  const calls: AdapterTextNodeInput[][] = [];
  const tree: HastRoot = {
    type: "root",
    children: [{
      type: "element",
      tagName: "p",
      children: [
        { type: "text", value: "«Version " },
        {
          type: "element",
          tagName: "span",
          data: { immutable: true },
          children: [{ type: "text", value: "1.2.3" }],
        },
        { type: "text", value: "»" },
      ],
    }],
  };

  rehypeOrthotypography({
    runTextNodePipeline: fixRunner(calls),
    rules: [testRule],
    locale: "fr-FR",
    mode: "fix",
    protect: (node) => node.data?.immutable === true,
  })(tree);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map(({ protected: value }) => value), [
    undefined,
    true,
    undefined,
  ]);
});

Deno.test("lint diagnostics are reported without mutating the tree", () => {
  const diagnostic: AdapterDiagnostic = {
    segmentIndex: 0,
    segmentId: "0.0",
    segmentValue: "texte",
    start: 0,
    end: 1,
    ruleId: "test",
    message: "test diagnostic",
  };
  const runner: TextNodePipelineRunner = (nodes) => ({
    value: nodes.map(({ value }) => value).join(""),
    nodes,
    changes: [],
    diagnostics: [diagnostic],
    appliedRuleIds: ["test"],
  });
  const tree: HastRoot = {
    type: "root",
    children: [{ type: "text", value: "texte" }],
  };
  const file = { data: {} as Record<string, unknown> };
  const reported: AdapterDiagnostic[] = [];

  rehypeOrthotypography({
    runTextNodePipeline: runner,
    rules: [testRule],
    locale: "fr-FR",
    mode: "lint",
    onDiagnostic: (value) => reported.push(value),
  })(tree, file);

  assert.equal(tree.children[0].value, "texte");
  assert.deepEqual(reported, [diagnostic]);
  assert.deepEqual(file.data.orthotypographyDiagnostics, [diagnostic]);
});

Deno.test("adapter rejects reordered pipeline output", () => {
  const runner: TextNodePipelineRunner = (nodes) => ({
    value: nodes.map(({ value }) => value).join(""),
    nodes: [...nodes].reverse(),
    changes: [],
    diagnostics: [],
    appliedRuleIds: [],
  });
  const tree: HastRoot = {
    type: "root",
    children: [
      { type: "text", value: "premier" },
      { type: "text", value: "second" },
    ],
  };

  assert.throws(
    () =>
      rehypeOrthotypography({
        runTextNodePipeline: runner,
        rules: [testRule],
        locale: "fr-FR",
        mode: "fix",
      })(tree),
    Error,
    "exactly the source text nodes in source order",
  );
});
