import {
  applyTextChanges,
  type DismissedProposal,
  type RuleDiagnostic,
  runTextNodePipeline,
  type RuntimeRule,
  type TextChange,
  type TextNodeInput,
  type TextNodeOutput,
} from "@orthotypography/core";

const documentPlanBrand: unique symbol = Symbol("DocumentPlan");
const documentBatchBrand: unique symbol = Symbol("DocumentBatch");

/** One logical text run; a paragraph or semantic boundary ends a run. */
export interface DocumentRun {
  readonly id: string;
  readonly locale: string;
  readonly nodes: readonly TextNodeInput[];
}

/** Adapter-owned revision must change for text, structure, or protection edits. */
export interface DocumentSnapshot {
  readonly documentId: string;
  readonly revision: string;
  readonly runs: readonly DocumentRun[];
}

/**
 * Proposal declined by the host, designated by its run and by the rule and
 * source location that a previous plan reported for it. The host keeps its
 * dismissals and updates their ranges when the document changes.
 */
export interface DocumentDismissal extends DismissedProposal {
  readonly runId: string;
}

export interface DocumentPlanOptions {
  /** Proposals to leave unapplied; the cascade is computed without them. */
  readonly dismissed?: readonly DocumentDismissal[];
}

/**
 * Unit of acceptance of a planned run. Its changes are applied together, and
 * the changes of any set of groups of one plan apply without conflict.
 */
export interface PlannedGroup {
  readonly runId: string;
  /** Core group ID, unique within its run. */
  readonly id: string;
  /** IDs of the run's changes; empty when its proposals cancel each other. */
  readonly changeIds: readonly string[];
  /** Indexes of the group's proposals in the run's diagnostics. */
  readonly diagnostics: readonly number[];
  /** Whether every proposal comes from a rule whose default mode is `fix`. */
  readonly suggested: boolean;
}

/** Source diagnostics, proposal groups, and their changes for one run. */
export interface PlannedRun {
  readonly id: string;
  /**
   * Source diagnostics. Proposals carry `groupId`, `changeIds`, and
   * `suggested`; dismissed proposals carry `dismissed` and no group.
   */
  readonly diagnostics: readonly RuleDiagnostic[];
  /** Changes of every group, in source order. */
  readonly changes: readonly TextChange[];
  readonly groups: readonly PlannedGroup[];
  /** Nodes once every group is applied. */
  readonly preview: readonly TextNodeOutput[];
}

/** Opaque, frozen, session-local plan created only by prepareDocumentPlan. */
export interface DocumentPlan {
  readonly [documentPlanBrand]: true;
  readonly source: DocumentSnapshot;
  readonly dismissed: readonly DocumentDismissal[];
  readonly runs: readonly PlannedRun[];
}

/** Changes are ordered by descending segment index and UTF-16 source offset. */
export interface DocumentBatchRun {
  readonly id: string;
  readonly changes: readonly TextChange[];
  /** Nodes of the run once these changes are applied. */
  readonly preview: readonly TextNodeOutput[];
}

/**
 * Opaque batch of accepted groups whose changed runs must be committed together
 * against expectedRevision.
 */
export interface DocumentBatch {
  readonly [documentBatchBrand]: true;
  readonly documentId: string;
  readonly expectedRevision: string;
  /** Accepted groups, in plan order. */
  readonly groups: readonly PlannedGroup[];
  readonly runs: readonly DocumentBatchRun[];
}

interface BatchOrigin {
  readonly plan: DocumentPlan;
  readonly accepted: readonly PlannedGroup[];
}

const plans = new WeakSet<DocumentPlan>();
const batches = new WeakMap<DocumentBatch, BatchOrigin>();

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function requireId(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${label}`);
  }
}

function copySnapshot(source: DocumentSnapshot): DocumentSnapshot {
  requireId(source.documentId, "document ID");
  requireId(source.revision, "document revision");
  const runIds = new Set<string>();
  return freeze({
    documentId: source.documentId,
    revision: source.revision,
    runs: source.runs.map((run) => {
      requireId(run.id, "run ID");
      requireId(run.locale, "run locale");
      if (runIds.has(run.id)) throw new Error(`Duplicate run ID: ${run.id}`);
      runIds.add(run.id);
      const nodeIds = new Set<string>();
      return {
        id: run.id,
        locale: run.locale,
        nodes: run.nodes.map((node) => {
          requireId(node.id, "node ID");
          if (nodeIds.has(node.id)) {
            throw new Error(`Duplicate node ID in run ${run.id}: ${node.id}`);
          }
          nodeIds.add(node.id);
          if (typeof node.value !== "string") {
            throw new Error(`Invalid node text in run ${run.id}`);
          }
          if (
            node.protected !== undefined && typeof node.protected !== "boolean"
          ) {
            throw new Error(`Invalid node protection in run ${run.id}`);
          }
          return {
            id: node.id,
            value: node.value,
            ...(node.protected === undefined
              ? {}
              : { protected: node.protected }),
          };
        }),
      };
    }),
  });
}

function copyDismissals(
  snapshot: DocumentSnapshot,
  dismissed: readonly DocumentDismissal[],
): readonly DocumentDismissal[] {
  const runIds = new Set(snapshot.runs.map((run) => run.id));
  return dismissed.map((entry) => {
    if (!runIds.has(entry.runId)) {
      throw new Error(`Unknown run in dismissed proposal: ${entry.runId}`);
    }
    return {
      runId: entry.runId,
      ruleId: entry.ruleId,
      ...(entry.segmentId === undefined ? {} : { segmentId: entry.segmentId }),
      ...(entry.segmentIndex === undefined
        ? {}
        : { segmentIndex: entry.segmentIndex }),
      start: entry.start,
      end: entry.end,
    };
  });
}

/**
 * Runs one `review` pass per run on a detached, immutable source snapshot.
 * Every rule proposes its changes; each rule's default mode becomes the
 * `suggested` hint of its proposals and groups.
 */
export function prepareDocumentPlan(
  source: DocumentSnapshot,
  rules: readonly RuntimeRule[],
  options: DocumentPlanOptions = {},
): DocumentPlan {
  const snapshot = copySnapshot(source);
  const dismissed = copyDismissals(snapshot, options.dismissed ?? []);
  const runs = snapshot.runs.map((run): PlannedRun => {
    const result = runTextNodePipeline(run.nodes, rules, {
      locale: run.locale,
      mode: "review",
      dismissed: dismissed.filter((entry) => entry.runId === run.id).map((
        { runId: _, ...entry },
      ) => entry),
    });
    // Validate the complete set before exposing a preview to an adapter.
    const applied = applyTextChanges(run.nodes, result.changes);
    if (
      applied.some((node, index) => node.value !== result.nodes[index]?.value)
    ) {
      throw new Error(`Changes do not reproduce preview for run ${run.id}`);
    }
    // Each change must belong to exactly one group to be accepted at all.
    const grouped = new Set(result.groups.flatMap((group) => group.changeIds));
    if (
      grouped.size !== result.changes.length ||
      result.groups.reduce((n, group) => n + group.changeIds.length, 0) !==
        grouped.size ||
      result.changes.some((change) => !grouped.has(change.id))
    ) {
      throw new Error(`Inconsistent proposal groups for run ${run.id}`);
    }
    return {
      id: run.id,
      diagnostics: result.diagnostics,
      changes: result.changes,
      groups: result.groups.map((group) => ({
        runId: run.id,
        id: group.id,
        changeIds: group.changeIds,
        diagnostics: group.diagnostics,
        suggested: group.suggested === true,
      })),
      preview: result.nodes,
    };
  });
  const plan: DocumentPlan = freeze({
    [documentPlanBrand]: true,
    source: snapshot,
    dismissed,
    runs,
  });
  plans.add(plan);
  return plan;
}

/**
 * Validates the entire source and returns the batch of the accepted groups
 * without writing. Groups are accepted whole, as the original objects of this
 * plan; a partial batch never contains isolated changes. The adapter must
 * recheck the revision inside its native atomic transaction.
 */
export function validateDocumentPlan(
  plan: DocumentPlan,
  current: DocumentSnapshot,
  accepted: readonly PlannedGroup[],
): DocumentBatch {
  if (!plans.has(plan)) {
    throw new Error(
      "Unknown document plan; prepare a new plan in this session",
    );
  }
  const snapshot = copySnapshot(current);
  if (snapshot.documentId !== plan.source.documentId) {
    throw new Error("Document ID does not match plan");
  }
  if (snapshot.revision !== plan.source.revision) {
    throw new Error("Stale document revision; prepare a new plan");
  }
  // Also catch adapter bugs that reuse a revision after a context change.
  // copySnapshot canonicalizes fields and retains run and node order.
  if (JSON.stringify(snapshot) !== JSON.stringify(plan.source)) {
    throw new Error("Document context changed; prepare a new plan");
  }
  const selected = new Set<PlannedGroup>();
  for (const group of accepted) {
    if (selected.has(group)) {
      throw new Error(`Duplicate accepted group: ${group.runId}/${group.id}`);
    }
    selected.add(group);
  }
  const known = plan.runs.flatMap((run) => run.groups);
  const groups = known.filter((group) => selected.has(group));
  if (groups.length !== selected.size) {
    throw new Error(
      "Unknown proposal group; accept whole groups of this plan",
    );
  }
  const runs = plan.runs.map((run, index): DocumentBatchRun => {
    const changeIds = new Set(
      run.groups.filter((group) => selected.has(group)).flatMap((group) =>
        group.changeIds
      ),
    );
    const changes = run.changes.filter((change) => changeIds.has(change.id));
    const nodes = snapshot.runs[index].nodes;
    const applied = applyTextChanges(nodes, changes);
    return {
      id: run.id,
      changes: [...changes].sort((a, b) =>
        b.segmentIndex - a.segmentIndex || b.start - a.start || b.end - a.end
      ),
      preview: nodes.map((node, nodeIndex) => ({
        id: node.id,
        value: applied[nodeIndex].value,
        ...(node.protected === undefined ? {} : { protected: node.protected }),
      })),
    };
  }).filter((run) => run.changes.length > 0);
  const batch: DocumentBatch = freeze({
    [documentBatchBrand]: true,
    documentId: snapshot.documentId,
    expectedRevision: snapshot.revision,
    groups,
    runs,
  });
  batches.set(batch, { plan, accepted: groups });
  return batch;
}

/** In-memory reference adapter; it does not model native formatting or undo. */
export interface MemoryDocument {
  /** Returns a detached-from-input, deeply frozen snapshot. */
  read(): DocumentSnapshot;
  /** Revalidates and commits an original SDK batch synchronously. */
  commit(batch: DocumentBatch): DocumentSnapshot;
  /** Simulates an external edit, including structure and protection changes. */
  replaceRuns(
    expectedRevision: string,
    runs: readonly DocumentRun[],
  ): DocumentSnapshot;
}

/**
 * Owns a document for one adapter lifetime. Revisions are opaque and never reused.
 * All writes stage a complete snapshot before a single synchronous state swap.
 */
export function createMemoryDocument(
  initial: DocumentSnapshot,
): MemoryDocument {
  let current = copySnapshot(initial);
  const initialRevision = current.revision;
  let generation = 0n;

  function replace(
    expectedRevision: string,
    runs: readonly DocumentRun[],
  ): DocumentSnapshot {
    const before = current;
    if (before.revision !== expectedRevision) {
      throw new Error("Stale document revision; prepare a new plan");
    }
    const nextGeneration = generation + 1n;
    const next = copySnapshot({
      documentId: before.documentId,
      revision: `${initialRevision}:${nextGeneration}`,
      runs,
    });
    // Input accessors must not overwrite a reentrant external edit.
    if (current !== before) {
      throw new Error("Stale document revision; prepare a new plan");
    }
    generation = nextGeneration;
    current = next;
    return current;
  }

  return Object.freeze({
    read: () => current,
    commit(batch: DocumentBatch): DocumentSnapshot {
      const origin = batches.get(batch);
      if (!origin) {
        throw new Error(
          "Unknown document batch; validate a plan in this session",
        );
      }
      validateDocumentPlan(origin.plan, current, origin.accepted);
      if (batch.runs.length === 0) return current;
      const changes = new Map(batch.runs.map((run) => [run.id, run.changes]));
      const runs = current.runs.map((run) => ({
        ...run,
        nodes: applyTextChanges(run.nodes, changes.get(run.id) ?? []).map(
          (node, index) => ({ ...run.nodes[index], value: node.value }),
        ),
      }));
      return replace(batch.expectedRevision, runs);
    },
    replaceRuns: replace,
  });
}
