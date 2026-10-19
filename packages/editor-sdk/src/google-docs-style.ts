import {
  type DocumentPlan,
  type DocumentSnapshot,
  type PlannedGroup,
  validateDocumentPlan,
} from "./mod.ts";
import {
  type GoogleDocsNodeRange,
  type GoogleDocsTextRequest,
  previewGoogleDocsRequests,
} from "./google-docs.ts";

/** Native text style JSON retained separately from the editor-neutral snapshot. */
export type GoogleDocsTextStyle = Readonly<Record<string, unknown>>;

/** Explicit mask also resets unset properties to their inherited values. */
export const GOOGLE_DOCS_STYLE_FIELDS =
  "bold,italic,underline,strikethrough,smallCaps,backgroundColor,foregroundColor,fontSize,weightedFontFamily,baselineOffset,link";

/** Copies JSON style data without retaining mutable input aliases. */
export function copyGoogleDocsTextStyle(value: unknown): GoogleDocsTextStyle {
  function copy(input: unknown): unknown {
    if (
      input === null || typeof input === "string" || typeof input === "boolean"
    ) return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (input && typeof input === "object" && !Array.isArray(input)) {
      return Object.freeze(
        Object.fromEntries(
          Object.entries(input).map(([key, child]) => [key, copy(child)]),
        ),
      );
    }
    throw new Error("Invalid Google Docs style JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Missing Google Docs text style");
  }
  return copy(value) as GoogleDocsTextStyle;
}

/** Conservative style subset for interior, unlinked text only. */
export function validateGoogleDocsTextStyle(style: GoogleDocsTextStyle): void {
  const allowed = GOOGLE_DOCS_STYLE_FIELDS.split(",");
  for (const [key, value] of Object.entries(style)) {
    if (!allowed.includes(key) || key === "link") {
      throw new Error("Unsupported Google Docs style field or link");
    }
    if (
      ["bold", "italic", "underline", "strikethrough", "smallCaps"].includes(
        key,
      )
    ) {
      if (typeof value !== "boolean") {
        throw new Error("Invalid Google Docs boolean style");
      }
    } else if (key === "baselineOffset") {
      if (
        !["NONE", "SUPERSCRIPT", "SUBSCRIPT", "BASELINE_OFFSET_UNSPECIFIED"]
          .includes(String(value))
      ) {
        throw new Error("Invalid Google Docs baseline style");
      }
    } else {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid Google Docs structured style");
      }
      const data = value as Record<string, unknown>;
      if (key === "fontSize") {
        if (
          Object.keys(data).some((k) => !["magnitude", "unit"].includes(k)) ||
          typeof data.magnitude !== "number" ||
          !Number.isFinite(data.magnitude) || data.magnitude <= 0 ||
          data.unit !== "PT"
        ) throw new Error("Invalid Google Docs font size");
      } else if (key === "weightedFontFamily") {
        if (
          Object.keys(data).some((k) =>
            !["fontFamily", "weight"].includes(k)
          ) ||
          typeof data.fontFamily !== "string" || !data.fontFamily.trim() ||
          (data.weight !== undefined &&
            (typeof data.weight !== "number" || data.weight < 100 ||
              data.weight > 900 || data.weight % 100 !== 0))
        ) throw new Error("Invalid Google Docs font family");
      } else {
        if (Object.keys(data).some((k) => k !== "color")) {
          throw new Error("Invalid Google Docs color");
        }
        if (data.color !== undefined) {
          const color = data.color as Record<string, unknown>;
          if (
            !color || typeof color !== "object" ||
            Object.keys(color).some((k) => k !== "rgbColor") ||
            !color.rgbColor || typeof color.rgbColor !== "object" ||
            Array.isArray(color.rgbColor)
          ) throw new Error("Invalid Google Docs color");
          for (const [channel, component] of Object.entries(color.rgbColor)) {
            if (
              !["red", "green", "blue"].includes(channel) ||
              typeof component !== "number" || !Number.isFinite(component) ||
              component < 0 || component > 1
            ) throw new Error("Invalid Google Docs RGB component");
          }
        }
      }
    }
  }
}

/** Style operation on newly inserted, interior text only. */
export interface GoogleDocsStyleRequest {
  readonly updateTextStyle: {
    readonly range: {
      readonly tabId: string;
      readonly startIndex: number;
      readonly endIndex: number;
    };
    readonly textStyle: GoogleDocsTextStyle;
    readonly fields: string;
  };
}

/** Review-only payload with text edits and explicit style restoration. */
export interface GoogleDocsStyledPreview {
  readonly documentId: string;
  readonly body: {
    readonly writeControl: { readonly requiredRevisionId: string };
    readonly requests:
      readonly (GoogleDocsTextRequest | GoogleDocsStyleRequest)[];
  };
}

/**
 * Compiles the accepted groups of a plan and restores each insertion's
 * source-node style, including inherited properties.
 * Requires full style metadata on every range. Links and insertions touching a
 * paragraph boundary are rejected until their native side effects are tested.
 * Styles and ranges must come from the same complete GET as the snapshot.
 */
export function previewGoogleDocsStyledRequests(
  plan: DocumentPlan,
  current: DocumentSnapshot,
  nativeRanges: readonly GoogleDocsNodeRange[],
  accepted: readonly PlannedGroup[],
): GoogleDocsStyledPreview {
  const ranges = nativeRanges.map((range) => ({
    ...range,
    textStyle: copyGoogleDocsTextStyle(range.textStyle),
  }));
  const preview = previewGoogleDocsRequests(plan, current, ranges, accepted);
  const batch = validateDocumentPlan(plan, current, accepted);
  const byNode = new Map(
    ranges.map((r) => [JSON.stringify([r.runId, r.nodeId]), r]),
  );
  for (const range of ranges) validateGoogleDocsTextStyle(range.textStyle);
  const insertions = new Map<string, GoogleDocsTextStyle>();
  const paragraphs: { tabId: string; start: number; end: number }[] = [];
  for (const source of plan.source.runs) {
    if (!source.nodes.length) continue;
    const run = batch.runs.find((r) => r.id === source.id);
    const first = byNode.get(JSON.stringify([source.id, source.nodes[0].id]))!;
    const last = byNode.get(
      JSON.stringify([source.id, source.nodes[source.nodes.length - 1].id]),
    )!;
    paragraphs.push({
      tabId: first.tabId,
      start: first.startIndex,
      end: last.endIndex,
    });
    for (const change of run?.changes ?? []) {
      if (!change.replacement.length) continue;
      const range = byNode.get(
        JSON.stringify([source.id, source.nodes[change.segmentIndex].id]),
      )!;
      const start = range.startIndex + change.start;
      const end = range.startIndex + change.end;
      if (start <= first.startIndex || end >= last.endIndex) {
        throw new Error(
          "Styled Google Docs insertion touches a paragraph boundary",
        );
      }
      const key = JSON.stringify([range.tabId, start]);
      if (insertions.has(key)) {
        throw new Error("Ambiguous Google Docs styled insertion");
      }
      insertions.set(key, range.textStyle);
    }
  }
  const requests: (GoogleDocsTextRequest | GoogleDocsStyleRequest)[] = [];
  for (const request of preview.body.requests) {
    requests.push(request);
    if ("deleteContentRange" in request) {
      const { tabId, startIndex, endIndex } = request.deleteContentRange.range;
      for (const paragraph of paragraphs) {
        if (paragraph.tabId !== tabId) continue;
        const shift = (position: number) =>
          position <= startIndex
            ? position
            : Math.max(startIndex, position - (endIndex - startIndex));
        paragraph.start = shift(paragraph.start);
        paragraph.end = shift(paragraph.end);
      }
    }
    if ("insertText" in request) {
      const { location, text } = request.insertText;
      const paragraph = paragraphs.find((p) =>
        p.tabId === location.tabId && p.start <= location.index &&
        p.end >= location.index
      );
      if (
        !paragraph || location.index <= paragraph.start ||
        location.index >= paragraph.end
      ) {
        throw new Error(
          "Styled Google Docs insertion touches a paragraph boundary after edits",
        );
      }
      for (const p of paragraphs) {
        if (p.tabId !== location.tabId) continue;
        if (p.start > location.index) p.start += text.length;
        if (p.end >= location.index) p.end += text.length;
      }
      const style = insertions.get(
        JSON.stringify([location.tabId, location.index]),
      );
      if (!style) throw new Error("Missing Google Docs insertion style");
      requests.push(Object.freeze({
        updateTextStyle: Object.freeze({
          range: Object.freeze({
            tabId: location.tabId,
            startIndex: location.index,
            endIndex: location.index + text.length,
          }),
          textStyle: style,
          fields: GOOGLE_DOCS_STYLE_FIELDS,
        }),
      }));
    }
  }
  return Object.freeze({
    documentId: preview.documentId,
    body: Object.freeze({
      writeControl: preview.body.writeControl,
      requests: Object.freeze(requests),
    }),
  });
}
