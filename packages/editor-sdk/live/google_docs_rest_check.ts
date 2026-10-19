/**
 * Live Google Docs check of the review pass, group acceptance, dismissed
 * proposals, and the REST transport.
 *
 * Run it on a throwaway document whose title starts with
 * `orthotypography-live-check` and whose body is one empty paragraph, from
 * `packages/editor-sdk`:
 *
 *   ./live/run.sh
 *
 * The runner prompts for the document URL or ID and, without echoing it, for
 * an access token with the `https://www.googleapis.com/auth/documents` scope.
 * `deno task live:rest` runs the script directly with the same variables,
 * `GOOGLE_DOCS_DOCUMENT_ID` and `GOOGLE_DOCS_ACCESS_TOKEN`.
 *
 * The access token is supplied by the caller, as a host application would; the
 * script never prints, stores, or refreshes it. The JSON report, written to
 * `live-report.json` and stdout, contains no document ID, revision ID, or
 * token; progress goes to stderr.
 */
import {
  IMPRIMERIE_NATIONALE_RULES as rules,
  type TextChange,
} from "@orthotypography/core";
import {
  commitGoogleDocsReview,
  createGoogleDocsRestTransport,
  discardGoogleDocsReview,
  extractGoogleDocsBody,
  type GoogleDocsReview,
  type GoogleDocsTransport,
  prepareGoogleDocsReview,
} from "../google-docs.ts";
import type { DocumentDismissal, PlannedGroup } from "../mod.ts";

const TITLE_PREFIX = "orthotypography-live-check";
const LOCALE = "fr-FR";
const READ = {
  includeTabsContent: true,
  suggestionsViewMode: "SUGGESTIONS_INLINE",
} as const;

/** Scenario paragraphs; the bold word exercises style restoration. */
const PARAGRAPHS = [
  "Il dit «Quoi?» puis : rien ! Fin.",
  "Bonjour , monde ; cela coûte 1200 € environ. Fin.",
  "Elle répond «oui» ! Fin.",
];
const BOLD = { paragraph: 1, word: "monde" };

interface Step {
  readonly name: string;
  readonly ok: boolean;
  readonly details: Record<string, unknown>;
}

/** Sanitized result: no document ID, revision ID, or credential. */
export interface LiveCheckReport {
  readonly check: "google-docs-rest-review-groups";
  readonly started: string;
  readonly finished: string;
  readonly runtime: { readonly deno: string };
  readonly locale: string;
  readonly rules: string;
  readonly ok: boolean;
  readonly failure?: string;
  readonly steps: readonly Step[];
}

let steps: Step[] = [];
let log = (message: string): void => {
  console.error(`[live] ${message}`);
};

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Check failed: ${message}`);
}

/**
 * Synthetic structure of the remaining proposals, for failure reports: the
 * scenario text is test data, so node values and changes can be reported.
 */
function remaining(review: GoogleDocsReview): Record<string, unknown> {
  return {
    runs: review.plan.runs.map((run, index) => ({
      paragraph: index,
      nodes: review.plan.source.runs[index].nodes.map((node) => node.value),
      changes: run.changes.map((change) => ({
        ruleIds: change.ruleIds,
        node: change.segmentIndex,
        start: change.start,
        end: change.end,
        expected: change.expected,
        replacement: change.replacement,
      })),
      dismissed: run.diagnostics.filter((d) => d.dismissed === true).map((
        d,
      ) => ({ ruleId: d.ruleId, node: d.segmentIndex, start: d.start })),
    })).filter((run) => run.changes.length > 0 || run.dismissed.length > 0),
  };
}

/** Records a failed step with its details, then stops the scenario. */
function fail(name: string, message: string, details: Record<string, unknown>) {
  steps.push({ name, ok: false, details });
  throw new Error(`Check failed: ${message}`);
}

function record(name: string, details: Record<string, unknown>): void {
  steps.push({ name, ok: true, details });
  log(`ok: ${name}`);
}

function texts(document: unknown): string[] {
  return extractGoogleDocsBody(document, LOCALE).snapshot.runs.map((run) =>
    run.nodes.map((node) => node.value).join("")
  );
}

function groups(review: GoogleDocsReview): readonly PlannedGroup[] {
  return review.plan.runs.flatMap((run) => run.groups);
}

function summary(review: GoogleDocsReview): Record<string, unknown> {
  return {
    runs: review.plan.runs.map((run) => ({
      groups: run.groups.length,
      suggestedGroups: run.groups.filter((group) => group.suggested).length,
      changes: run.changes.length,
      proposals: run.diagnostics.filter((d) => d.groupId !== undefined).length,
      dismissed: run.diagnostics.filter((d) => d.dismissed === true).length,
      lintOnly:
        run.diagnostics.filter((d) =>
          d.groupId === undefined && d.dismissed !== true
        ).length,
    })),
    previewRequests: review.preview.body.requests.length,
  };
}

/**
 * Dismissal kept by the client in terms that survive native index shifts:
 * paragraph and text-run ordinals, plus offsets inside the source node.
 */
interface TrackedDismissal {
  readonly paragraph: number;
  readonly node: number;
  readonly ruleId: string;
  start: number;
  end: number;
}

/** Resolves a tracked dismissal against the document as it is now. */
async function resolve(
  transport: GoogleDocsTransport,
  documentId: string,
  tracked: TrackedDismissal,
): Promise<DocumentDismissal> {
  const { snapshot } = extractGoogleDocsBody(
    await transport.read(documentId, READ),
    LOCALE,
  );
  const run = snapshot.runs[tracked.paragraph];
  check(run, "tracked dismissal paragraph exists");
  const node = run.nodes[tracked.node];
  check(node, "tracked dismissal node exists");
  return {
    runId: run.id,
    ruleId: tracked.ruleId,
    segmentId: node.id,
    start: tracked.start,
    end: tracked.end,
  };
}

/** Shifts a tracked range by the committed changes that precede it. */
function shift(
  tracked: TrackedDismissal,
  changes: readonly TextChange[],
): void {
  let delta = 0;
  for (const change of changes) {
    if (change.segmentIndex !== tracked.node) continue;
    check(
      change.end <= tracked.start || change.start >= tracked.end,
      "a committed change does not overlap the dismissed proposal",
    );
    if (change.end <= tracked.start) {
      delta += change.replacement.length - (change.end - change.start);
    }
  }
  tracked.start += delta;
  tracked.end += delta;
}

async function setup(transport: GoogleDocsTransport, documentId: string) {
  const document = await transport.read(documentId, READ) as {
    title?: unknown;
    revisionId?: string;
    tabs?: { childTabs?: unknown[] }[];
  };
  check(
    typeof document.title === "string" &&
      document.title.startsWith(TITLE_PREFIX),
    `document title starts with ${TITLE_PREFIX}`,
  );
  check(
    document.tabs?.length === 1 && !(document.tabs[0].childTabs?.length),
    "document has a single tab",
  );
  check(
    texts(document).join("") === "" && texts(document).length === 1,
    "document body is one empty paragraph",
  );
  const text = PARAGRAPHS.join("\n");
  const offset = PARAGRAPHS.slice(0, BOLD.paragraph).reduce(
    (n, paragraph) => n + paragraph.length + 1,
    0,
  ) + PARAGRAPHS[BOLD.paragraph].indexOf(BOLD.word);
  const tabId = (document.tabs[0] as { tabProperties: { tabId: string } })
    .tabProperties.tabId;
  const result = await transport.write({
    documentId,
    requiredRevisionId: document.revisionId!,
    requests: [
      { insertText: { location: { tabId, index: 1 }, text } },
      {
        updateTextStyle: {
          range: {
            tabId,
            startIndex: 1 + offset,
            endIndex: 1 + offset + BOLD.word.length,
          },
          textStyle: { bold: true },
          fields: "bold",
        },
      },
    ],
  });
  check(result.ok, `setup write succeeded (${JSON.stringify(result)})`);
  const after = await transport.read(documentId, READ);
  check(
    JSON.stringify(texts(after)) === JSON.stringify(PARAGRAPHS),
    "setup readback reproduces the scenario paragraphs",
  );
  record("setup", { paragraphs: PARAGRAPHS.length });
}

async function scenario(
  transport: GoogleDocsTransport,
  documentId: string,
): Promise<void> {
  await setup(transport, documentId);

  // 1. One review pass, without writing.
  const first = await prepareGoogleDocsReview(
    transport,
    documentId,
    LOCALE,
    rules,
  );
  const firstSummary = summary(first);
  check(
    first.plan.runs.every((run) => run.groups.length > 0),
    "every paragraph has proposals",
  );
  check(
    groups(first).some((group) => !group.suggested),
    "at least one group is not suggested",
  );
  check(
    groups(first).every((group) => group.changeIds.length > 0),
    "no group cancels itself (core issue #54 fixed)",
  );
  record("review-pass", firstSummary);

  // 2. Partial commit: every group of paragraph 1, the first group of
  // paragraph 2, nothing in paragraph 3.
  const accepted = [
    ...first.plan.runs[0].groups,
    first.plan.runs[1].groups[0],
  ];
  const before = first.before.runs.map((run) =>
    run.nodes.map((n) => n.value).join("")
  );
  const partial = await commitGoogleDocsReview(transport, first, accepted);
  check(
    partial.status === "applied",
    `partial commit applied (${partial.status})`,
  );
  const afterPartial = partial.after.runs.map((run) =>
    run.nodes.map((n) => n.value).join("")
  );
  check(
    afterPartial[0] === first.plan.runs[0].preview.map((n) => n.value).join(""),
    "paragraph 1 fully corrected",
  );
  check(afterPartial[1] !== before[1], "paragraph 2 partially corrected");
  check(
    afterPartial[1] !== first.plan.runs[1].preview.map((n) => n.value).join(""),
    "paragraph 2 keeps its other proposals",
  );
  check(afterPartial[2] === before[2], "paragraph 3 unchanged");
  record("partial-commit", {
    acceptedGroups: partial.accepted.length,
    totalGroups: groups(first).length,
    requests: partial.committed.body.requests.length,
    previewRequests: first.preview.body.requests.length,
    readbackVerifiedBySdk: true,
  });

  // 3. Dismiss the first proposal of paragraph 3 and commit the rest, styled.
  const probe = await prepareGoogleDocsReview(
    transport,
    documentId,
    LOCALE,
    rules,
  );
  const run3 = probe.plan.runs[2];
  const target = run3.diagnostics[run3.groups[0].diagnostics[0]];
  const tracked: TrackedDismissal = {
    paragraph: 2,
    node: target.segmentIndex,
    ruleId: target.ruleId,
    start: target.start,
    end: target.end,
  };
  discardGoogleDocsReview(transport, probe);
  const dismissedReview = await prepareGoogleDocsReview(
    transport,
    documentId,
    LOCALE,
    rules,
    {
      preserveStyles: true,
      dismissed: [await resolve(transport, documentId, tracked)],
    },
  );
  const dismissedRun = dismissedReview.plan.runs[2];
  check(
    dismissedRun.diagnostics.some((d) =>
      d.dismissed === true && d.ruleId === tracked.ruleId
    ),
    "dismissed proposal is reported",
  );
  check(
    dismissedRun.changes.length < run3.changes.length &&
      dismissedRun.groups.length === run3.groups.length - 1,
    "dismissed proposal is out of the cascade",
  );
  const styled = await commitGoogleDocsReview(
    transport,
    dismissedReview,
    groups(dismissedReview),
  );
  check(
    styled.status === "applied",
    `styled commit applied (${styled.status})`,
  );
  const committedRun3 = styled.plan.runs[2].changes;
  shift(tracked, committedRun3);
  record("dismissed-then-styled-commit", {
    dismissedRule: tracked.ruleId,
    ...summary(dismissedReview),
    requests: styled.committed.body.requests.length,
    styleRequests: styled.committed.body.requests.filter((r) =>
      "updateTextStyle" in r
    ).length,
    readbackVerifiedBySdk: true,
  });

  // 4. The client keeps the dismissal after updating its range: native IDs
  // moved with the commit, so it is resolved again against the new document.
  const keptAgain = await prepareGoogleDocsReview(
    transport,
    documentId,
    LOCALE,
    rules,
    { dismissed: [await resolve(transport, documentId, tracked)] },
  );
  if (keptAgain.preview.body.requests.length !== 0) {
    fail("dismissal-kept", "only the dismissed proposal remains", {
      requests: keptAgain.preview.body.requests.length,
      ...remaining(keptAgain),
    });
  }
  check(
    keptAgain.plan.runs[2].diagnostics.some((d) => d.dismissed === true),
    "dismissal still matches after range update",
  );
  const unchanged = await commitGoogleDocsReview(
    transport,
    keptAgain,
    groups(keptAgain),
  );
  check(unchanged.status === "unchanged", "no write when nothing changes");
  record("dismissal-kept", { requests: 0, status: unchanged.status });

  // 5. Stale review: two reviews of one revision; the second commit conflicts.
  const stale = await prepareGoogleDocsReview(
    transport,
    documentId,
    LOCALE,
    rules,
  );
  const fresh = await prepareGoogleDocsReview(
    transport,
    documentId,
    LOCALE,
    rules,
  );
  check(groups(fresh).length === 1, "without dismissal, one group remains");
  const applied = await commitGoogleDocsReview(
    transport,
    fresh,
    groups(fresh),
  );
  check(applied.status === "applied", "fresh review applied");
  const conflict = await commitGoogleDocsReview(
    transport,
    stale,
    groups(stale),
  );
  check(
    conflict.status === "revision-conflict",
    `stale review conflicts (${conflict.status})`,
  );
  const afterConflict = await transport.read(documentId, READ);
  check(
    JSON.stringify(texts(afterConflict)) ===
      JSON.stringify(
        applied.after.runs.map((r) => r.nodes.map((n) => n.value).join("")),
      ),
    "conflict left the document unchanged",
  );
  record("stale-review", {
    freshStatus: applied.status,
    staleStatus: conflict.status,
    documentUnchangedAfterConflict: true,
  });

  // 6. Idempotence.
  const final = await prepareGoogleDocsReview(
    transport,
    documentId,
    LOCALE,
    rules,
  );
  if (final.preview.body.requests.length !== 0) {
    fail("idempotence", "final pass is idempotent", {
      requests: final.preview.body.requests.length,
      ...remaining(final),
    });
  }
  discardGoogleDocsReview(transport, final);
  record("idempotence", { groups: groups(final).length });
  record("final-text", { paragraphs: texts(afterConflict) });
}

/**
 * Runs the scenario once on a throwaway document and returns its report.
 * Stops at the first failed check; earlier steps stay in the report.
 */
export async function runLiveCheck(
  transport: GoogleDocsTransport,
  documentId: string,
  options: { readonly log?: (message: string) => void } = {},
): Promise<LiveCheckReport> {
  steps = [];
  if (options.log) log = options.log;
  const started = new Date().toISOString();
  let failure: string | undefined;
  try {
    await scenario(transport, documentId);
  } catch (error) {
    failure = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
    log(failure);
  }
  return {
    check: "google-docs-rest-review-groups",
    started,
    finished: new Date().toISOString(),
    runtime: { deno: Deno.version.deno },
    locale: LOCALE,
    rules: "IMPRIMERIE_NATIONALE_RULES",
    ok: failure === undefined,
    ...(failure === undefined ? {} : { failure }),
    steps: [...steps],
  };
}

/** Accepts a bare document ID or a docs.google.com document URL. */
export function documentIdFrom(input: string): string {
  const value = input.trim();
  const fromUrl = /\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/.exec(value)
    ?.[1];
  const id = fromUrl ?? value;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    throw new Error(
      "GOOGLE_DOCS_DOCUMENT_ID must be a Google Docs document ID or URL",
    );
  }
  return id;
}

/** Report file written next to this package, outside version control. */
export const REPORT_FILE = "live-report.json";

if (import.meta.main) {
  const fail = (message: string): never => {
    console.error(`[live] ${message}`);
    Deno.exit(2);
  };
  let documentId = "";
  try {
    documentId = documentIdFrom(Deno.env.get("GOOGLE_DOCS_DOCUMENT_ID") ?? "");
  } catch (error) {
    fail((error as Error).message);
  }
  if (!Deno.env.get("GOOGLE_DOCS_ACCESS_TOKEN")?.trim()) {
    fail("GOOGLE_DOCS_ACCESS_TOKEN is empty; see the header of this script.");
  }
  const transport = createGoogleDocsRestTransport({
    getAccessToken: () => Deno.env.get("GOOGLE_DOCS_ACCESS_TOKEN") ?? "",
  });
  const report = await runLiveCheck(transport, documentId);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await Deno.writeTextFile(REPORT_FILE, json);
  console.log(json);
  console.error(
    `[live] ${report.ok ? "passed" : "FAILED"}; report written to ${
      new URL(REPORT_FILE, `file://${Deno.cwd()}/`).pathname
    }`,
  );
  if (!report.ok) Deno.exitCode = 1;
}
