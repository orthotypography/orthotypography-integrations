import type { RunEdit, RuntimeRule } from "@orthotypography/core";
import type { DocumentPlan, PlannedGroup } from "../src/mod.ts";
import type { GoogleDocsTextRequest } from "../src/google-docs.ts";

/** Every group of a plan, in plan order. */
export function allGroups(plan: DocumentPlan): readonly PlannedGroup[] {
  return plan.runs.flatMap((run) => run.groups);
}

/**
 * External rule that proposes fixed edits, in logical-run coordinates, as one
 * proposal located on the range they cover. Its ID is outside the catalogue.
 */
export function syntheticRule(
  edits: readonly RunEdit[],
  options: { readonly id?: string; readonly suggested?: boolean } = {},
): RuntimeRule {
  return {
    id: options.id ?? "x-test.synthetic",
    phase: "cleanup",
    locales: ["fr-FR"],
    defaultMode: options.suggested === false ? "manual-review" : "fix",
    apply: () =>
      edits.length === 0 ? {} : {
        diagnostics: [{
          start: Math.min(...edits.map((edit) => edit.start)),
          end: Math.max(...edits.map((edit) => edit.end)),
          message: "Synthetic proposal",
          edits,
        }],
      },
  };
}

interface SimulatedElement {
  startIndex?: number;
  endIndex: number;
  textRun?: { content: string };
}

interface SimulatedContent {
  startIndex?: number;
  endIndex: number;
  paragraph?: { elements: SimulatedElement[] };
}

interface SimulatedTab {
  tabProperties: { tabId: string };
  documentTab: { body: { content: SimulatedContent[] } };
  childTabs?: SimulatedTab[];
}

/**
 * Applies text-only Google Docs requests to a copy of a fixture document and
 * renumbers its indexes, as a stand-in readback for offline tests. Styles of
 * inserted text are not modeled.
 */
export function applyGoogleDocsTextRequests(
  document: unknown,
  requests: readonly GoogleDocsTextRequest[],
  revisionId: string,
): unknown {
  const copy = structuredClone(document) as {
    revisionId: string;
    tabs: SimulatedTab[];
  };
  copy.revisionId = revisionId;
  const find = (tabs: readonly SimulatedTab[], tabId: string): SimulatedTab[] =>
    tabs.flatMap((tab) =>
      tab.tabProperties.tabId === tabId
        ? [tab]
        : find(tab.childTabs ?? [], tabId)
    );
  const tabOf = (tabId: string) => find(copy.tabs, tabId)[0];
  const elements = (tabId: string) =>
    tabOf(tabId).documentTab.body.content.flatMap((item) =>
      item.paragraph?.elements ?? []
    );
  const renumber = (tabId: string) => {
    const tab = tabOf(tabId);
    let cursor = 0;
    for (const item of tab.documentTab.body.content) {
      if (!item.paragraph) {
        cursor = item.endIndex;
        continue;
      }
      item.startIndex = cursor;
      for (const element of item.paragraph.elements) {
        element.startIndex = cursor;
        cursor += element.textRun!.content.length;
        element.endIndex = cursor;
      }
      item.endIndex = cursor;
    }
  };
  for (const request of requests) {
    if ("deleteContentRange" in request) {
      const { tabId, startIndex, endIndex } = request.deleteContentRange.range;
      for (const element of elements(tabId)) {
        const start = Math.max(startIndex, element.startIndex!);
        const end = Math.min(endIndex, element.endIndex);
        if (start >= end) continue;
        const text = element.textRun!.content;
        element.textRun!.content = text.slice(0, start - element.startIndex!) +
          text.slice(end - element.startIndex!);
      }
      renumber(tabId);
    } else if ("insertText" in request) {
      const { location, text } = request.insertText;
      const element = elements(location.tabId).find((item) =>
        item.startIndex! <= location.index && location.index < item.endIndex
      )!;
      const offset = location.index - element.startIndex!;
      const content = element.textRun!.content;
      element.textRun!.content = content.slice(0, offset) + text +
        content.slice(offset);
      renumber(location.tabId);
    } else {
      throw new Error("Unsupported simulated request");
    }
  }
  return copy;
}
