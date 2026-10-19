import type { RuntimeRule } from "@orthotypography/core";
import { extractGoogleDocsBody } from "./google-docs-extract.ts";
import {
  type GoogleDocsRequestPreview,
  type GoogleDocsTextRequest,
  previewGoogleDocsRequests,
} from "./google-docs.ts";
import {
  type GoogleDocsStyledPreview,
  type GoogleDocsStyleRequest,
  previewGoogleDocsStyledRequests,
} from "./google-docs-style.ts";
import {
  type DocumentBatch,
  type DocumentDismissal,
  type DocumentPlan,
  type DocumentSnapshot,
  type PlannedGroup,
  prepareDocumentPlan,
  validateDocumentPlan,
} from "./mod.ts";

/** Exact read requirements for a response accepted by the extractor. */
export interface GoogleDocsReadOptions {
  readonly includeTabsContent: true;
  readonly suggestionsViewMode: "SUGGESTIONS_INLINE";
}

/** Failure categories supplied by a host adapter, without vendor error parsing. */
export type GoogleDocsWriteFailureKind =
  | "revision-conflict"
  | "permission"
  | "invalid-request"
  | "transient"
  | "unknown";

export type GoogleDocsWriteResult =
  | { readonly ok: true }
  | {
    readonly ok: false;
    readonly kind: GoogleDocsWriteFailureKind;
    readonly message?: string;
  };

export interface GoogleDocsWriteInput {
  readonly documentId: string;
  readonly requests: readonly (
    | GoogleDocsTextRequest
    | GoogleDocsStyleRequest
  )[];
  readonly requiredRevisionId: string;
}

/** Minimal authenticated boundary implemented outside this package. */
export interface GoogleDocsTransport {
  read(documentId: string, options: GoogleDocsReadOptions): Promise<unknown>;
  write(input: GoogleDocsWriteInput): Promise<GoogleDocsWriteResult>;
}

export type GoogleDocsNormalizationPreview =
  | GoogleDocsRequestPreview
  | GoogleDocsStyledPreview;

const googleDocsReviewBrand: unique symbol = Symbol("GoogleDocsReview");

interface GoogleDocsReviewBase {
  readonly [googleDocsReviewBrand]: true;
  readonly before: DocumentSnapshot;
  readonly plan: DocumentPlan;
}

/**
 * Opaque review whose preview contains text operations only. The preview
 * compiles every group of the plan; a commit compiles the accepted groups.
 */
export interface GoogleDocsTextReview extends GoogleDocsReviewBase {
  readonly mode: "text";
  readonly preview: GoogleDocsRequestPreview;
}

/**
 * Opaque review whose preview also restores supported source styles. The
 * preview compiles every group of the plan; a commit compiles the accepted
 * groups.
 */
export interface GoogleDocsStyledReview extends GoogleDocsReviewBase {
  readonly mode: "preserve-styles";
  readonly preview: GoogleDocsStyledPreview;
}

/** Session-local review returned only by prepareGoogleDocsReview. */
export type GoogleDocsReview = GoogleDocsTextReview | GoogleDocsStyledReview;

/** Accepted groups of a committed review and the payload compiled for them. */
export interface GoogleDocsCommitment<TReview extends GoogleDocsReview> {
  /** Accepted groups, in plan order. */
  readonly accepted: readonly PlannedGroup[];
  /** Requests compiled for the accepted groups; empty when nothing changes. */
  readonly committed: TReview["preview"];
}

export type GoogleDocsNormalizationResult<
  TReview extends GoogleDocsReview = GoogleDocsReview,
> =
  | (TReview & GoogleDocsCommitment<TReview> & {
    readonly status: "unchanged";
  })
  | (TReview & GoogleDocsCommitment<TReview> & {
    readonly status: "revision-conflict";
  })
  | (TReview & GoogleDocsCommitment<TReview> & {
    readonly status: "applied";
    readonly after: DocumentSnapshot;
  });

export interface GoogleDocsReviewOptions {
  readonly preserveStyles?: boolean;
  /**
   * Proposals the host declined, designated by run, rule, and source location
   * as a previous plan reported them. The host keeps and updates them.
   */
  readonly dismissed?: readonly DocumentDismissal[];
}

interface GoogleDocsReviewState {
  readonly transport: GoogleDocsTransport;
  readonly source: ReturnType<typeof extractGoogleDocsBody>;
  readonly locale: string;
  status: "prepared" | "committing" | "committed" | "discarded";
}

const reviews = new WeakMap<GoogleDocsReview, GoogleDocsReviewState>();

export type GoogleDocsReviewErrorKind =
  | "unknown-review"
  | "transport-mismatch"
  | "already-consumed";

/** Invalid origin, transport, or lifecycle state for an opaque review. */
export class GoogleDocsReviewError extends Error {
  constructor(readonly kind: GoogleDocsReviewErrorKind, message: string) {
    super(message);
    this.name = "GoogleDocsReviewError";
  }
}

/** Non-conflict write failure reported explicitly by the host adapter. */
export class GoogleDocsTransportFailure extends Error {
  constructor(
    readonly kind: Exclude<
      GoogleDocsWriteFailureKind,
      "revision-conflict"
    >,
    message?: string,
  ) {
    super(message ?? `Google Docs transport failure: ${kind}`);
    this.name = "GoogleDocsTransportFailure";
  }
}

/** Successful write whose full readback does not reproduce the prepared plan. */
export class GoogleDocsReadbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleDocsReadbackError";
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${
    Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    ).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(
      ",",
    )
  }}`;
}

function verifyReadback(
  before: ReturnType<typeof extractGoogleDocsBody>,
  plan: DocumentPlan,
  batch: DocumentBatch,
  after: ReturnType<typeof extractGoogleDocsBody>,
  styled: boolean,
): void {
  if (after.snapshot.documentId !== before.snapshot.documentId) {
    throw new GoogleDocsReadbackError("Google Docs readback identity changed");
  }
  if (after.snapshot.revision === before.snapshot.revision) {
    throw new GoogleDocsReadbackError(
      "Google Docs readback revision did not advance",
    );
  }
  if (after.snapshot.runs.length !== plan.runs.length) {
    throw new GoogleDocsReadbackError("Google Docs readback structure changed");
  }
  for (const [index, planned] of plan.runs.entries()) {
    const source = before.snapshot.runs[index];
    const observed = after.snapshot.runs[index];
    // Runs without accepted changes must keep their source text.
    const expected = batch.runs.find((run) => run.id === planned.id)?.preview ??
      source.nodes;
    const expectedText = expected.map((node) => node.value).join("");
    const observedText = observed.nodes.map((node) => node.value).join("");
    if (observedText !== expectedText) {
      throw new GoogleDocsReadbackError(
        "Google Docs readback text differs from plan",
      );
    }
    const expectedTab = before.ranges.find((range) => range.runId === source.id)
      ?.tabId;
    const observedTab = after.ranges.find((range) =>
      range.runId === observed.id
    )
      ?.tabId;
    if (expectedTab !== observedTab && (expectedTab || observedTab)) {
      throw new GoogleDocsReadbackError("Google Docs readback tab changed");
    }
    if (!styled) continue;
    const expectedStyles = expected.flatMap((node) => {
      const range = before.ranges.find((item) =>
        item.runId === source.id && item.nodeId === node.id
      );
      if (!range?.textStyle) {
        throw new GoogleDocsReadbackError(
          "Missing source style during readback",
        );
      }
      return Array.from({ length: node.value.length }, () => range.textStyle);
    });
    const observedStyles = observed.nodes.flatMap((node) => {
      const range = after.ranges.find((item) =>
        item.runId === observed.id && item.nodeId === node.id
      );
      if (!range?.textStyle) {
        throw new GoogleDocsReadbackError(
          "Missing observed style during readback",
        );
      }
      return Array.from({ length: node.value.length }, () => range.textStyle);
    });
    if (canonical(observedStyles) !== canonical(expectedStyles)) {
      throw new GoogleDocsReadbackError(
        "Google Docs readback styles differ from plan",
      );
    }
  }
}

/** Every group of a plan, in plan order. */
function allGroups(plan: DocumentPlan): readonly PlannedGroup[] {
  return plan.runs.flatMap((run) => run.groups);
}

/** Reads once and prepares a style-preserving review without writing. */
export function prepareGoogleDocsReview(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options: { readonly preserveStyles: true },
): Promise<GoogleDocsStyledReview>;

/** Reads once and prepares a text-only review without writing. */
export function prepareGoogleDocsReview(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options?: { readonly preserveStyles?: false },
): Promise<GoogleDocsTextReview>;

/** Reads once and preserves the review mode selected at runtime. */
export function prepareGoogleDocsReview(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options: GoogleDocsReviewOptions,
): Promise<GoogleDocsReview>;

export async function prepareGoogleDocsReview(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options: GoogleDocsReviewOptions = {},
): Promise<GoogleDocsReview> {
  const readOptions = Object.freeze({
    includeTabsContent: true as const,
    suggestionsViewMode: "SUGGESTIONS_INLINE" as const,
  });
  const before = extractGoogleDocsBody(
    await transport.read(documentId, readOptions),
    locale,
  );
  if (before.snapshot.documentId !== documentId) {
    throw new Error("Google Docs transport returned a different document");
  }
  const plan = prepareDocumentPlan(before.snapshot, rules, {
    dismissed: options.dismissed ?? [],
  });
  const styled = options.preserveStyles === true;
  const groups = allGroups(plan);
  const review: GoogleDocsReview = styled
    ? Object.freeze({
      [googleDocsReviewBrand]: true as const,
      mode: "preserve-styles" as const,
      before: before.snapshot,
      plan,
      preview: previewGoogleDocsStyledRequests(
        plan,
        before.snapshot,
        before.ranges,
        groups,
      ),
    })
    : Object.freeze({
      [googleDocsReviewBrand]: true as const,
      mode: "text" as const,
      before: before.snapshot,
      plan,
      preview: previewGoogleDocsRequests(
        plan,
        before.snapshot,
        before.ranges,
        groups,
      ),
    });
  reviews.set(review, {
    transport,
    source: before,
    locale,
    status: "prepared",
  });
  return review;
}

/**
 * Commits the accepted groups of one original review exactly once and verifies
 * one full readback. Groups are accepted whole, as the original objects of the
 * review's plan. Revision conflicts consume the review and are returned without
 * retry. An invalid selection throws before the review is consumed.
 */
export function commitGoogleDocsReview(
  transport: GoogleDocsTransport,
  review: GoogleDocsStyledReview,
  accepted: readonly PlannedGroup[],
): Promise<GoogleDocsNormalizationResult<GoogleDocsStyledReview>>;

export function commitGoogleDocsReview(
  transport: GoogleDocsTransport,
  review: GoogleDocsTextReview,
  accepted: readonly PlannedGroup[],
): Promise<GoogleDocsNormalizationResult<GoogleDocsTextReview>>;

export function commitGoogleDocsReview(
  transport: GoogleDocsTransport,
  review: GoogleDocsReview,
  accepted: readonly PlannedGroup[],
): Promise<GoogleDocsNormalizationResult>;

export async function commitGoogleDocsReview(
  transport: GoogleDocsTransport,
  review: GoogleDocsReview,
  accepted: readonly PlannedGroup[],
): Promise<GoogleDocsNormalizationResult> {
  const state = reviews.get(review);
  if (!state) {
    throw new GoogleDocsReviewError(
      "unknown-review",
      "Unknown Google Docs review; prepare it in this module session",
    );
  }
  if (state.transport !== transport) {
    throw new GoogleDocsReviewError(
      "transport-mismatch",
      "Google Docs review requires its original transport",
    );
  }
  if (state.status !== "prepared") {
    throw new GoogleDocsReviewError(
      "already-consumed",
      "Google Docs review was already consumed",
    );
  }
  // Compile and validate the selection against the prepared read first.
  const { snapshot, ranges } = state.source;
  const batch = validateDocumentPlan(review.plan, snapshot, accepted);
  const committed = review.mode === "preserve-styles"
    ? previewGoogleDocsStyledRequests(review.plan, snapshot, ranges, accepted)
    : previewGoogleDocsRequests(review.plan, snapshot, ranges, accepted);
  const commitment = { accepted: batch.groups, committed };
  state.status = "committing";
  if (committed.body.requests.length === 0) {
    state.status = "committed";
    return Object.freeze({ ...review, ...commitment, status: "unchanged" });
  }
  const result = await transport.write({
    documentId: committed.documentId,
    requests: committed.body.requests,
    requiredRevisionId: committed.body.writeControl.requiredRevisionId,
  });
  state.status = "committed";
  if (!result.ok) {
    if (result.kind === "revision-conflict") {
      return Object.freeze({
        ...review,
        ...commitment,
        status: "revision-conflict",
      });
    }
    throw new GoogleDocsTransportFailure(result.kind, result.message);
  }
  const after = extractGoogleDocsBody(
    await transport.read(review.before.documentId, {
      includeTabsContent: true,
      suggestionsViewMode: "SUGGESTIONS_INLINE",
    }),
    state.locale,
  );
  verifyReadback(
    state.source,
    review.plan,
    batch,
    after,
    review.mode === "preserve-styles",
  );
  return Object.freeze({
    ...review,
    ...commitment,
    status: "applied",
    after: after.snapshot,
  });
}

/**
 * Irreversibly consumes an original review without writing. Applications should
 * call this when a user rejects or closes a prepared review.
 */
export function discardGoogleDocsReview(
  transport: GoogleDocsTransport,
  review: GoogleDocsReview,
): void {
  const state = reviews.get(review);
  if (!state) {
    throw new GoogleDocsReviewError(
      "unknown-review",
      "Unknown Google Docs review; prepare it in this module session",
    );
  }
  if (state.transport !== transport) {
    throw new GoogleDocsReviewError(
      "transport-mismatch",
      "Google Docs review requires its original transport",
    );
  }
  if (state.status !== "prepared") {
    throw new GoogleDocsReviewError(
      "already-consumed",
      "Google Docs review was already consumed",
    );
  }
  state.status = "discarded";
}

/**
 * Reads, writes, and verifies a style-preserving normalization that accepts
 * every group of the prepared plan.
 */
export function normalizeGoogleDocsDocument(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options: { readonly preserveStyles: true },
): Promise<GoogleDocsNormalizationResult<GoogleDocsStyledReview>>;

/**
 * Reads, writes, and verifies a text-only normalization that accepts every
 * group of the prepared plan.
 */
export function normalizeGoogleDocsDocument(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options?: { readonly preserveStyles?: false },
): Promise<GoogleDocsNormalizationResult<GoogleDocsTextReview>>;

/**
 * Reads, writes, and verifies the normalization mode selected at runtime,
 * accepting every group of the prepared plan.
 */
export function normalizeGoogleDocsDocument(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options: GoogleDocsReviewOptions,
): Promise<GoogleDocsNormalizationResult>;

export async function normalizeGoogleDocsDocument(
  transport: GoogleDocsTransport,
  documentId: string,
  locale: string,
  rules: readonly RuntimeRule[],
  options: GoogleDocsReviewOptions = {},
): Promise<GoogleDocsNormalizationResult> {
  const review = await prepareGoogleDocsReview(
    transport,
    documentId,
    locale,
    rules,
    options,
  );
  return await commitGoogleDocsReview(
    transport,
    review,
    allGroups(review.plan),
  );
}
