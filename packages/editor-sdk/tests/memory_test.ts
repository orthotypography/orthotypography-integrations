import assert from "node:assert/strict";
import { IMPRIMERIE_NATIONALE_RULES } from "@orthotypography/core";
import {
  createMemoryDocument,
  type DocumentSnapshot,
  prepareDocumentPlan,
  validateDocumentPlan,
} from "../src/mod.ts";

function source(): DocumentSnapshot {
  return {
    documentId: "document",
    revision: "r1",
    runs: [
      {
        id: "one",
        locale: "fr-FR",
        nodes: [
          { id: "a", value: "😀 Bonjour " },
          { id: "b", value: ":suite" },
        ],
      },
      {
        id: "two",
        locale: "fr-FR",
        nodes: [
          { id: "a", value: "25% !" },
          { id: "protected", value: "code :test", protected: true },
        ],
      },
    ],
  };
}

function prepare(snapshot: DocumentSnapshot) {
  const plan = prepareDocumentPlan(snapshot, IMPRIMERIE_NATIONALE_RULES);
  const groups = plan.runs.flatMap((run) => run.groups);
  return { plan, batch: validateDocumentPlan(plan, snapshot, groups) };
}

Deno.test("memory commits all runs and preserves nodes, protections and UTF-16", () => {
  const initial = source();
  const memory = createMemoryDocument(initial);
  const before = memory.read();
  const { plan, batch } = prepare(before);
  assert.equal(batch.runs.length, 2);
  const after = memory.commit(batch);
  assert.deepEqual(
    after.runs.map((run) => run.nodes),
    plan.runs.map((run) => run.preview),
  );
  assert.notEqual(after.revision, before.revision);
  assert.deepEqual(before, initial);
  assert.equal(after.runs[1].nodes[1].protected, true);
  assert.equal(after.runs[1].nodes[1].value, "code :test");
  assert.equal(memory.read(), after);
  assert.throws(() => memory.commit(batch), /Stale/);
  assert.equal(memory.read(), after);
});

Deno.test("memory snapshots cannot be changed through input or output aliases", () => {
  const initial = source();
  const memory = createMemoryDocument(initial);
  Object.assign(initial.runs[0].nodes[0], { value: "changed" });
  assert.equal(memory.read().runs[0].nodes[0].value, "😀 Bonjour ");
  assert.throws(
    () => Object.assign(memory.read().runs[0].nodes[0], { value: "changed" }),
    TypeError,
  );
  const replacement = structuredClone(source().runs);
  const after = memory.replaceRuns(memory.read().revision, replacement);
  Object.assign(replacement[0].nodes[0], { value: "changed" });
  assert.equal(after.runs[0].nodes[0].value, "😀 Bonjour ");
});

Deno.test("an edit after validation rejects the entire batch without partial writes", () => {
  const memory = createMemoryDocument(source());
  const { batch } = prepare(memory.read());
  const runs = structuredClone(memory.read().runs);
  Object.assign(runs[1].nodes[0], { value: "Concurrent edit" });
  const concurrent = memory.replaceRuns(memory.read().revision, runs);
  assert.throws(() => memory.commit(batch), /Stale/);
  assert.equal(memory.read(), concurrent);
  assert.deepEqual(memory.read().runs[0], source().runs[0]);
});

Deno.test("restoring original text cannot revive an old batch", () => {
  const memory = createMemoryDocument(source());
  const before = memory.read();
  const { batch } = prepare(before);
  memory.replaceRuns(before.revision, []);
  const restored = memory.replaceRuns(memory.read().revision, before.runs);
  assert.deepEqual(restored.runs, before.runs);
  assert.notEqual(restored.revision, before.revision);
  assert.throws(() => memory.commit(batch), /Stale/);
});

Deno.test("invalid late run and stale external edits leave the state intact", () => {
  const memory = createMemoryDocument(source());
  const before = memory.read();
  assert.throws(
    () =>
      memory.replaceRuns(before.revision, [before.runs[0], {
        ...before.runs[1],
        id: "",
      }]),
    /Missing/,
  );
  assert.equal(memory.read(), before);
  assert.throws(() => memory.replaceRuns("old", []), /Stale/);
  assert.equal(memory.read(), before);
});

Deno.test("memory rejects reconstructed batches and mismatched document context", () => {
  const initial = source();
  const { batch } = prepare(initial);
  const memory = createMemoryDocument(initial);
  for (const forged of [{ ...batch, runs: [] }, structuredClone(batch)]) {
    assert.throws(() => memory.commit(forged), /Unknown document batch/);
  }
  const other = createMemoryDocument({ ...initial, documentId: "other" });
  assert.throws(() => other.commit(batch), /Document ID/);
  const runs = structuredClone(initial.runs);
  Object.assign(runs[1].nodes[0], { protected: true });
  const divergent = createMemoryDocument({ ...initial, runs });
  const before = divergent.read();
  assert.throws(() => divergent.commit(batch), /context changed/);
  assert.equal(divergent.read(), before);
});

Deno.test("empty batches preserve revision but still reject stale context", () => {
  const memory = createMemoryDocument({ ...source(), runs: [] });
  const before = memory.read();
  const { batch } = prepare(before);
  assert.equal(memory.commit(batch), before);
  memory.replaceRuns(before.revision, []);
  assert.throws(() => memory.commit(batch), /Stale/);
});

Deno.test("competing validated batches allow only the first writer", async () => {
  const memory = createMemoryDocument(source());
  const first = prepare(memory.read()).batch;
  const second = prepare(memory.read()).batch;
  const results = await Promise.allSettled([
    Promise.resolve().then(() => memory.commit(first)),
    Promise.resolve().then(() => memory.commit(second)),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  if (results[1].status === "rejected") {
    assert.match(results[1].reason.message, /Stale/);
  }
});

Deno.test("memory commits accepted groups only and revalidates them", () => {
  const memory = createMemoryDocument(source());
  const before = memory.read();
  const plan = prepareDocumentPlan(before, IMPRIMERIE_NATIONALE_RULES);
  // Accept the first group of the second run only.
  const accepted = [plan.runs[1].groups[0]];
  const batch = validateDocumentPlan(plan, before, accepted);
  assert.deepEqual(batch.runs.map((run) => run.id), ["two"]);
  const after = memory.commit(batch);
  assert.deepEqual(after.runs[0], before.runs[0]);
  assert.deepEqual(after.runs[1].nodes, batch.runs[0].preview);
  assert.notDeepEqual(after.runs[1].nodes, plan.runs[1].preview);
  assert.throws(() => memory.commit(batch), /Stale/);
});
