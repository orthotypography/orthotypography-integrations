import assert from "node:assert/strict";
import {
  applyTextChanges,
  FRENCH_GUILLEMETS_SPACING_RULE,
  IMPRIMERIE_NATIONALE_PUNCTUATION_RULES,
  IMPRIMERIE_NATIONALE_RULES,
  runTextNodePipeline,
  type RuntimeRule,
} from "@orthotypography/core";
import {
  type DocumentBatch,
  type DocumentPlan,
  type DocumentSnapshot,
  type PlannedGroup,
  prepareDocumentPlan,
  validateDocumentPlan,
} from "../src/mod.ts";
import { syntheticRule } from "./helpers.ts";

function source(): DocumentSnapshot {
  return {
    documentId: "document",
    revision: "revision-1",
    runs: [{
      id: "paragraph",
      locale: "fr-FR",
      nodes: [
        { id: "emphasis", value: "Bonjour " },
        { id: "plain", value: ":suite" },
      ],
    }],
  };
}

const rules = IMPRIMERIE_NATIONALE_PUNCTUATION_RULES;

function groups(plan: DocumentPlan): readonly PlannedGroup[] {
  return plan.runs.flatMap((run) => run.groups);
}

Deno.test("plan links source diagnostics to grouped fixes and preserves inline nodes", () => {
  const snapshot = source();
  const original = structuredClone(snapshot);
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.deepEqual(snapshot, original);
  assert.deepEqual(plan.runs[0].preview, [
    { id: "emphasis", value: "Bonjour" },
    { id: "plain", value: "\u00a0: suite" },
  ]);
  assert.ok(plan.runs[0].diagnostics.length > 0);
  const values = new Map(snapshot.runs[0].nodes.map((n) => [n.id, n.value]));
  for (const diagnostic of plan.runs[0].diagnostics) {
    assert.equal(diagnostic.segmentValue, values.get(diagnostic.segmentId!));
    assert.equal(diagnostic.suggested, "apply");
    assert.ok(
      plan.runs[0].groups.some((group) => group.id === diagnostic.groupId),
    );
  }
  // The colon spacing spans both nodes and is accepted as one group.
  assert.ok(
    plan.runs[0].groups.some((group) =>
      new Set(
        group.changeIds.map((id) =>
          plan.runs[0].changes.find((change) => change.id === id)!.segmentId
        ),
      ).size === 2
    ),
  );
  assert.ok(
    plan.runs[0].diagnostics.some((d) =>
      d.related?.some((location) => location.segmentId === "emphasis")
    ),
  );
});

Deno.test("batch reproduces preview with native descending replacements", () => {
  const snapshot = source();
  const plan = prepareDocumentPlan(snapshot, rules);
  const batch = validateDocumentPlan(plan, snapshot, groups(plan));
  assert.equal(batch.expectedRevision, "revision-1");
  assert.equal(batch.documentId, "document");
  const values = snapshot.runs[0].nodes.map((node) => node.value);
  for (const edit of batch.runs[0].changes) {
    assert.equal(
      values[edit.segmentIndex].slice(edit.start, edit.end),
      edit.expected,
    );
    values[edit.segmentIndex] = values[edit.segmentIndex].slice(0, edit.start) +
      edit.replacement + values[edit.segmentIndex].slice(edit.end);
  }
  assert.deepEqual(values, plan.runs[0].preview.map((node) => node.value));
  for (let index = 1; index < batch.runs[0].changes.length; index++) {
    assert.ok(
      batch.runs[0].changes[index - 1].segmentIndex >=
        batch.runs[0].changes[index].segmentIndex,
    );
  }
});

Deno.test("source and plan are detached and deeply immutable", () => {
  const snapshot = source();
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.notEqual(plan.source, snapshot);
  assert.notEqual(plan.source.runs[0].nodes, snapshot.runs[0].nodes);
  assert.equal(Object.isFrozen(snapshot), false);
  assert.ok(Object.isFrozen(plan.source.runs[0].nodes[0]));
  assert.ok(Object.isFrozen(plan.runs[0].changes[0].ruleIds));
  assert.ok(Object.isFrozen(plan.runs[0].diagnostics[0]));
  assert.throws(
    () => Object.assign(plan.source.runs[0].nodes[0], { value: "edit" }),
    TypeError,
  );
  Object.assign(snapshot.runs[0].nodes[0], { value: "Changed " });
  assert.equal(plan.source.runs[0].nodes[0].value, "Bonjour ");
  assert.throws(
    () => validateDocumentPlan(plan, snapshot, groups(plan)),
    /context changed/,
  );
});

Deno.test("rejects different document identity and newer revisions", () => {
  const snapshot = source();
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.throws(
    () =>
      validateDocumentPlan(
        plan,
        { ...snapshot, documentId: "other" },
        groups(plan),
      ),
    /Document ID/,
  );
  assert.throws(
    () =>
      validateDocumentPlan(
        plan,
        { ...snapshot, revision: "revision-2" },
        groups(plan),
      ),
    /Stale document revision/,
  );
});

Deno.test("rejects context edits even when expected substrings still match", () => {
  const snapshot = source();
  const plan = prepareDocumentPlan(snapshot, rules);
  const current = structuredClone(snapshot);
  Object.assign(current.runs[0].nodes[0], { value: "Bonsoir " });
  // Equal length and identical trailing space: individual expected guards pass.
  for (const edit of plan.runs[0].changes) {
    assert.equal(
      current.runs[0].nodes[edit.segmentIndex].value.slice(
        edit.start,
        edit.end,
      ),
      edit.expected,
    );
  }
  assert.throws(
    () => validateDocumentPlan(plan, current, groups(plan)),
    /context changed/,
  );
});

Deno.test("rejects changed identity, order, locale, protection and boundaries", () => {
  const snapshot = source();
  const plan = prepareDocumentPlan(snapshot, rules);
  const run = snapshot.runs[0];
  for (
    const replacement of [
      { ...run, id: "other" },
      { ...run, locale: "en-US" },
      { ...run, nodes: [...run.nodes].reverse() },
      { ...run, nodes: [{ ...run.nodes[0], id: "new" }, run.nodes[1]] },
      { ...run, nodes: [{ ...run.nodes[0], protected: true }, run.nodes[1]] },
      { ...run, nodes: [run.nodes[0]] },
    ]
  ) {
    assert.throws(
      () =>
        validateDocumentPlan(
          plan,
          { ...snapshot, runs: [replacement] },
          groups(plan),
        ),
      /context changed/,
    );
  }
  assert.throws(
    () => validateDocumentPlan(plan, { ...snapshot, runs: [] }, groups(plan)),
    /context changed/,
  );
});

Deno.test("rejects duplicate and missing identities before analysis", () => {
  const snapshot = source();
  const run = snapshot.runs[0];
  for (
    const invalid of [
      { ...snapshot, documentId: "" },
      { ...snapshot, revision: " " },
      { ...snapshot, runs: [run, run] },
      { ...snapshot, runs: [{ ...run, id: "" }] },
      { ...snapshot, runs: [{ ...run, locale: "" }] },
      { ...snapshot, runs: [{ ...run, nodes: [run.nodes[0], run.nodes[0]] }] },
      { ...snapshot, runs: [{ ...run, nodes: [{ id: "", value: "text" }] }] },
    ]
  ) {
    assert.throws(
      () => prepareDocumentPlan(invalid, rules),
      /Missing|Duplicate/,
    );
  }
});

Deno.test("plans cannot be forged, cloned, filtered or deserialized", () => {
  const snapshot = source();
  const plan = prepareDocumentPlan(snapshot, rules);
  for (
    const altered of [
      { ...plan, runs: [] },
      structuredClone(plan),
      JSON.parse(JSON.stringify(plan)),
    ]
  ) {
    assert.throws(
      () => validateDocumentPlan(altered, snapshot, []),
      /Unknown document plan/,
    );
  }
});

Deno.test("plans and batches cannot be reconstructed structurally", () => {
  const snapshot = source();
  const plan = prepareDocumentPlan(snapshot, rules);
  const batch = validateDocumentPlan(plan, snapshot, groups(plan));
  // @ts-expect-error plans are opaque values created only by the SDK
  const reconstructedPlan: DocumentPlan = {
    source: plan.source,
    runs: plan.runs,
  };
  // @ts-expect-error batches are opaque values created only by the SDK
  const reconstructedBatch: DocumentBatch = {
    documentId: batch.documentId,
    expectedRevision: batch.expectedRevision,
    groups: batch.groups,
    runs: batch.runs,
  };
  assert.throws(
    () => validateDocumentPlan(reconstructedPlan, snapshot, []),
    /Unknown document plan/,
  );
  assert.notEqual(reconstructedBatch, batch);
});

Deno.test("protected nodes retain text and participate in quote context", () => {
  const snapshot: DocumentSnapshot = {
    ...source(),
    runs: [{
      id: "quote",
      locale: "fr-FR",
      nodes: [
        { id: "opening", value: "«Version " },
        { id: "code", value: "1.2.3", protected: true },
        { id: "closing", value: "»" },
      ],
    }],
  };
  const plan = prepareDocumentPlan(snapshot, [FRENCH_GUILLEMETS_SPACING_RULE]);
  assert.deepEqual(plan.runs[0].preview.map((n) => n.value), [
    "«\u00a0Version ",
    "1.2.3",
    "\u00a0»",
  ]);
  assert.ok(plan.runs[0].changes.every((c) => c.segmentId !== "code"));
  assert.equal(
    validateDocumentPlan(plan, snapshot, groups(plan)).runs.length,
    1,
  );
});

Deno.test("separate runs never share quote context and node IDs are run scoped", () => {
  const snapshot: DocumentSnapshot = {
    ...source(),
    runs: [
      { id: "one", locale: "fr-FR", nodes: [{ id: "text", value: "«texte" }] },
      { id: "two", locale: "fr-FR", nodes: [{ id: "text", value: "»" }] },
    ],
  };
  const quoteRules = [FRENCH_GUILLEMETS_SPACING_RULE];
  const plan = prepareDocumentPlan(snapshot, quoteRules);
  for (const [index, run] of snapshot.runs.entries()) {
    const isolated = runTextNodePipeline(run.nodes, quoteRules, {
      locale: run.locale,
      mode: "review",
    });
    assert.deepEqual(plan.runs[index].preview, isolated.nodes);
    assert.deepEqual(plan.runs[index].changes, isolated.changes);
  }
});

Deno.test("UTF-16 edits preserve astral characters and classifier protections", () => {
  const snapshot: DocumentSnapshot = {
    ...source(),
    runs: [{
      id: "p",
      locale: "fr-FR",
      nodes: [{ id: "n", value: "😀 Version 1.2.3 : 25%. Bonjour , monde." }],
    }],
  };
  const plan = prepareDocumentPlan(snapshot, IMPRIMERIE_NATIONALE_RULES);
  let value = snapshot.runs[0].nodes[0].value;
  for (
    const edit of validateDocumentPlan(plan, snapshot, groups(plan)).runs[0]
      .changes
  ) {
    assert.equal(value.slice(edit.start, edit.end), edit.expected);
    value = value.slice(0, edit.start) + edit.replacement +
      value.slice(edit.end);
  }
  assert.equal(value, plan.runs[0].preview[0].value);
  assert.ok(value.startsWith("😀 Version 1.2.3"));
});

Deno.test("empty and unchanged documents produce no native operations", () => {
  for (
    const runs of [[], [{ id: "empty", locale: "fr-FR", nodes: [] }], [{
      id: "plain",
      locale: "fr-FR",
      nodes: [{ id: "n", value: "Bonjour." }],
    }]]
  ) {
    const snapshot = { ...source(), runs };
    const plan = prepareDocumentPlan(snapshot, rules);
    assert.deepEqual(
      validateDocumentPlan(plan, snapshot, groups(plan)).runs,
      [],
    );
  }
});

Deno.test("a changed untouched run invalidates the entire batch", () => {
  const snapshot = {
    ...source(),
    runs: [...source().runs, {
      id: "other",
      locale: "fr-FR",
      nodes: [{ id: "n", value: "Bonjour." }],
    }],
  };
  const plan = prepareDocumentPlan(snapshot, rules);
  assert.equal(
    validateDocumentPlan(plan, snapshot, groups(plan)).runs.length,
    1,
  );
  const current = structuredClone(snapshot);
  Object.assign(current.runs[1].nodes[0], { value: "Bonsoir." });
  assert.throws(
    () => validateDocumentPlan(plan, current, groups(plan)),
    /context changed/,
  );
});

function single(value: string): DocumentSnapshot {
  return {
    documentId: "document",
    revision: "revision-1",
    runs: [{ id: "p", locale: "fr-FR", nodes: [{ id: "n", value }] }],
  };
}

Deno.test("one review pass proposes every rule and reproduces the fix output", () => {
  const snapshot = single("Il dit « Quoi ? » et paie 1200 €.");
  const plan = prepareDocumentPlan(snapshot, IMPRIMERIE_NATIONALE_RULES);
  const fix = runTextNodePipeline(
    snapshot.runs[0].nodes,
    IMPRIMERIE_NATIONALE_RULES,
    { locale: "fr-FR", mode: "fix" },
  );
  assert.deepEqual(
    plan.runs[0].changes.map(({ id: _, ...change }) => change),
    fix.changes.map(({ id: _, ...change }) => change),
  );
  assert.deepEqual(plan.runs[0].preview, fix.nodes);
  const euro = plan.runs[0].diagnostics.findIndex((d) =>
    d.ruleId === "number.euro.nbsp-before"
  );
  assert.equal(plan.runs[0].diagnostics[euro].suggested, "review");
  const group = plan.runs[0].groups.find((g) => g.diagnostics.includes(euro))!;
  assert.equal(group.suggested, false);
  assert.ok(plan.runs[0].groups.some((g) => g.suggested));
});

Deno.test("a batch contains exactly the changes of the accepted groups", () => {
  const snapshot = single("Bonjour , monde ! Il dit «oui» ; puis.");
  const plan = prepareDocumentPlan(snapshot, rules);
  const run = plan.runs[0];
  assert.ok(run.groups.length >= 3);
  const accepted = [run.groups[2], run.groups[0]];
  const batch = validateDocumentPlan(plan, snapshot, accepted);
  // Accepted groups are reported in plan order.
  assert.deepEqual(batch.groups, [run.groups[0], run.groups[2]]);
  const expected = new Set(accepted.flatMap((group) => group.changeIds));
  assert.deepEqual(
    new Set(batch.runs[0].changes.map((change) => change.id)),
    expected,
  );
  assert.deepEqual(
    batch.runs[0].preview,
    applyTextChanges(snapshot.runs[0].nodes, batch.runs[0].changes),
  );
  assert.notDeepEqual(batch.runs[0].preview, run.preview);
  assert.ok(Object.isFrozen(batch.groups));
  assert.deepEqual(validateDocumentPlan(plan, snapshot, []).runs, []);
});

Deno.test("every union of groups applies and all groups reproduce the preview", () => {
  const snapshot = single("Bonjour , monde ! Il dit «oui» ; puis : fin.");
  const plan = prepareDocumentPlan(snapshot, IMPRIMERIE_NATIONALE_RULES);
  const all = groups(plan);
  assert.ok(all.length >= 4 && all.length <= 12);
  for (let mask = 0; mask < 1 << all.length; mask++) {
    const accepted = all.filter((_, index) => (mask & (1 << index)) !== 0);
    const batch = validateDocumentPlan(plan, snapshot, accepted);
    const count = accepted.reduce((n, group) => n + group.changeIds.length, 0);
    assert.equal(batch.runs[0]?.changes.length ?? 0, count);
  }
  assert.deepEqual(
    validateDocumentPlan(plan, snapshot, all).runs[0].preview,
    plan.runs[0].preview,
  );
});

Deno.test("only original groups of the same plan are accepted, once each", () => {
  const snapshot = single("Bonjour , monde !");
  const plan = prepareDocumentPlan(snapshot, rules);
  const other = prepareDocumentPlan(snapshot, rules);
  const group = plan.runs[0].groups[0];
  for (
    const accepted of [
      [{ ...group }],
      [structuredClone(group)],
      [other.runs[0].groups[0]],
    ]
  ) {
    assert.throws(
      () => validateDocumentPlan(plan, snapshot, accepted),
      /Unknown proposal group/,
    );
  }
  assert.throws(
    () => validateDocumentPlan(plan, snapshot, [group, group]),
    /Duplicate accepted group/,
  );
});

Deno.test("dismissed proposals are reported but recomputed out of the cascade", () => {
  const snapshot = single("Bonjour , monde !");
  const plan = prepareDocumentPlan(snapshot, rules);
  const target = plan.runs[0].diagnostics.find((d) =>
    d.ruleId === "punctuation.exclamation.nnbsp-before"
  )!;
  const dismissal = {
    runId: "p",
    ruleId: target.ruleId,
    segmentId: target.segmentId,
    start: target.start,
    end: target.end,
  };
  const replanned = prepareDocumentPlan(snapshot, rules, {
    dismissed: [dismissal],
  });
  assert.deepEqual(replanned.dismissed, [dismissal]);
  assert.ok(Object.isFrozen(replanned.dismissed[0]));
  const reported = replanned.runs[0].diagnostics.find((d) =>
    d.ruleId === target.ruleId
  )!;
  assert.equal(reported.dismissed, true);
  assert.equal(reported.groupId, undefined);
  assert.ok(
    replanned.runs[0].changes.every((change) =>
      !change.ruleIds.includes(target.ruleId)
    ),
  );
  assert.equal(replanned.runs[0].preview[0].value, "Bonjour, monde !");
  assert.equal(replanned.runs[0].groups.length, plan.runs[0].groups.length - 1);
  assert.throws(
    () =>
      prepareDocumentPlan(snapshot, rules, {
        dismissed: [{ ...dismissal, runId: "other" }],
      }),
    /Unknown run in dismissed proposal/,
  );
});

Deno.test("a group whose proposals cancel each other has no change to accept", () => {
  const insert = syntheticRule([{ start: 1, end: 1, replacement: "x" }], {
    id: "x-test.insert",
  });
  const remove: RuntimeRule = {
    id: "x-test.remove",
    phase: "cleanup",
    locales: ["fr-FR"],
    defaultMode: "fix",
    dependsOn: ["x-test.insert"],
    apply: (run) => {
      const index = run.text.indexOf("x");
      return index < 0 ? {} : {
        diagnostics: [{
          start: index,
          end: index + 1,
          message: "Remove",
          edits: [{ start: index, end: index + 1, replacement: "" }],
        }],
      };
    },
  };
  const snapshot = single("ab");
  const plan = prepareDocumentPlan(snapshot, [
    { ...insert, phase: "glyphs" },
    remove,
  ]);
  assert.equal(plan.runs[0].groups.length, 1);
  assert.deepEqual(plan.runs[0].groups[0].changeIds, []);
  assert.deepEqual(plan.runs[0].groups[0].diagnostics, [0, 1]);
  assert.deepEqual(
    validateDocumentPlan(plan, snapshot, plan.runs[0].groups).runs,
    [],
  );
});
