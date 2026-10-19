import {
  type DocumentPlan,
  type DocumentSnapshot,
  type PlannedGroup,
  validateDocumentPlan,
} from "./mod.ts";
import type { GoogleDocsTextStyle } from "./google-docs-style.ts";

/** Native body-text range extracted from the same Google Docs revision. */
export interface GoogleDocsNodeRange {
  readonly runId: string;
  readonly nodeId: string;
  readonly tabId: string;
  readonly startIndex: number;
  readonly endIndex: number;
  /** Original TextRun style; required only by the styled preview. */
  readonly textStyle?: GoogleDocsTextStyle;
}

/** Supported body-text operations. Formatting operations are not generated. */
export type GoogleDocsTextRequest =
  | {
    readonly deleteContentRange: {
      readonly range: {
        readonly tabId: string;
        readonly startIndex: number;
        readonly endIndex: number;
      };
    };
  }
  | {
    readonly insertText: {
      readonly location: { readonly tabId: string; readonly index: number };
      readonly text: string;
    };
  };

/** Review-only request payload; not a complete native editor adapter. */
export interface GoogleDocsRequestPreview {
  readonly documentId: string;
  readonly body: {
    readonly writeControl: { readonly requiredRevisionId: string };
    readonly requests: readonly GoogleDocsTextRequest[];
  };
}

function key(runId: string, nodeId: string): string {
  return JSON.stringify([runId, nodeId]);
}

function splitsSurrogate(text: string, offset: number): boolean {
  const left = text.charCodeAt(offset - 1);
  const right = text.charCodeAt(offset);
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff;
}

/**
 * Compiles the accepted groups of a plan to descending body-text requests with
 * a revision guard. The caller supplies paragraph-bounded text and native
 * ranges from one read. This function cannot verify those ranges against
 * Google or preserve styles.
 */
export function previewGoogleDocsRequests(
  plan: DocumentPlan,
  current: DocumentSnapshot,
  nativeRanges: readonly GoogleDocsNodeRange[],
  accepted: readonly PlannedGroup[],
): GoogleDocsRequestPreview {
  const batch = validateDocumentPlan(plan, current, accepted);
  const ranges = new Map<string, GoogleDocsNodeRange>();
  for (const input of nativeRanges) {
    const range = { ...input };
    if (
      typeof range.tabId !== "string" || range.tabId.trim() === "" ||
      !Number.isSafeInteger(range.startIndex) || range.startIndex < 1 ||
      !Number.isSafeInteger(range.endIndex) ||
      range.endIndex <= range.startIndex
    ) throw new Error("Invalid Google Docs body range");
    const id = key(range.runId, range.nodeId);
    if (ranges.has(id)) throw new Error("Duplicate Google Docs node range");
    ranges.set(id, range);
  }
  let count = 0;
  for (const run of plan.source.runs) {
    let previous: GoogleDocsNodeRange | undefined;
    for (const node of run.nodes) {
      const range = ranges.get(key(run.id, node.id));
      if (!range || range.endIndex - range.startIndex !== node.value.length) {
        throw new Error("Missing or length-mismatched Google Docs node range");
      }
      // Exclude paragraph terminators, inline objects and empty native ranges.
      if (/[\r\n\ufffc]/u.test(node.value) || !node.value.isWellFormed()) {
        throw new Error("Unsupported Google Docs source text");
      }
      if (
        previous &&
        (range.tabId !== previous.tabId ||
          range.startIndex !== previous.endIndex)
      ) {
        throw new Error("Google Docs run ranges must be contiguous in one tab");
      }
      previous = range;
      count++;
    }
  }
  if (count !== ranges.size) throw new Error("Unknown Google Docs node range");
  const ordered = [...ranges.values()].sort((a, b) =>
    a.tabId < b.tabId ? -1 : a.tabId > b.tabId ? 1 : a.startIndex - b.startIndex
  );
  for (let index = 1; index < ordered.length; index++) {
    if (
      ordered[index].tabId === ordered[index - 1].tabId &&
      ordered[index].startIndex < ordered[index - 1].endIndex
    ) {
      throw new Error("Overlapping Google Docs node ranges");
    }
  }
  const edits = batch.runs.flatMap((run) =>
    run.changes.map((change) => {
      const source = plan.source.runs.find((item) => item.id === run.id)!;
      const node = source.nodes[change.segmentIndex];
      const range = ranges.get(key(run.id, node.id))!;
      if (
        splitsSurrogate(node.value, change.start) ||
        splitsSurrogate(node.value, change.end) ||
        !change.replacement.isWellFormed() ||
        [...change.replacement].some((character) => {
          const code = character.charCodeAt(0);
          return code < 0x20 || (code >= 0xe000 && code <= 0xf8ff) ||
            code === 0xfffc;
        })
      ) throw new Error("Unsupported Google Docs replacement text or boundary");
      return {
        tabId: range.tabId,
        start: range.startIndex + change.start,
        end: range.startIndex + change.end,
        replacement: change.replacement,
      };
    })
  );
  // Runs need not arrive in native document order. Tabs have independent indexes.
  edits.sort((a, b) =>
    a.tabId < b.tabId
      ? -1
      : a.tabId > b.tabId
      ? 1
      : b.start - a.start || b.end - a.end
  );
  const requests: GoogleDocsTextRequest[] = [];
  for (const edit of edits) {
    if (edit.start < edit.end) {
      requests.push(
        Object.freeze({
          deleteContentRange: Object.freeze({
            range: Object.freeze({
              tabId: edit.tabId,
              startIndex: edit.start,
              endIndex: edit.end,
            }),
          }),
        }),
      );
    }
    if (edit.replacement !== "") {
      requests.push(Object.freeze({
        insertText: Object.freeze({
          location: Object.freeze({ tabId: edit.tabId, index: edit.start }),
          text: edit.replacement,
        }),
      }));
    }
  }
  return Object.freeze({
    documentId: batch.documentId,
    body: Object.freeze({
      writeControl: Object.freeze({
        requiredRevisionId: batch.expectedRevision,
      }),
      requests: Object.freeze(requests),
    }),
  });
}
