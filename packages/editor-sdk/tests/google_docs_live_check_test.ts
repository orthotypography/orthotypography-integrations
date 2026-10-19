import assert from "node:assert/strict";
import { createGoogleDocsRestTransport } from "../src/google-docs-rest.ts";
import { runLiveCheck } from "../live/google_docs_rest_check.ts";

type Style = Readonly<Record<string, unknown>>;
interface Character {
  readonly c: string;
  readonly style: Style;
}

/**
 * Minimal in-memory Google Docs v1 service for one single-tab document: GET
 * documents/{id} and POST documents/{id}:batchUpdate with insertText,
 * deleteContentRange, updateTextStyle, and requiredRevisionId. Inserted text
 * takes the style of the preceding character in its paragraph. It only
 * approximates the service; it does not replace a live run.
 */
function fakeGoogleDocs(title: string) {
  let characters: Character[] = [{ c: "\n", style: {} }];
  let revision = 0;
  const requests: string[] = [];

  function body() {
    const content: unknown[] = [{
      endIndex: 1,
      sectionBreak: { sectionStyle: {} },
    }];
    let index = 1;
    let paragraph: { startIndex: number; elements: unknown[] } | undefined;
    let run: { startIndex: number; text: string; style: Style } | undefined;
    const flush = (end: number) => {
      if (run) {
        paragraph!.elements.push({
          startIndex: run.startIndex,
          endIndex: end,
          textRun: { content: run.text, textStyle: run.style },
        });
      }
      run = undefined;
    };
    for (const character of characters) {
      paragraph ??= { startIndex: index, elements: [] };
      if (
        !run || JSON.stringify(run.style) !== JSON.stringify(character.style)
      ) {
        flush(index);
        run = { startIndex: index, text: "", style: character.style };
      }
      run.text += character.c;
      index++;
      if (character.c === "\n") {
        flush(index);
        content.push({
          startIndex: paragraph.startIndex,
          endIndex: index,
          paragraph: { elements: paragraph.elements, paragraphStyle: {} },
        });
        paragraph = undefined;
      }
    }
    return content;
  }

  function apply(request: Record<string, Record<string, unknown>>): void {
    if (request.insertText) {
      const { location, text } = request.insertText as {
        location: { index: number };
        text: string;
      };
      const at = location.index - 1;
      const previous = characters[at - 1];
      const style = previous && previous.c !== "\n"
        ? previous.style
        : characters[at]?.style ?? {};
      characters.splice(
        at,
        0,
        ...[...text].flatMap((c) =>
          c.split("").map((unit) => ({ c: unit, style }))
        ),
      );
    } else if (request.deleteContentRange) {
      const { startIndex, endIndex } = request.deleteContentRange.range as {
        startIndex: number;
        endIndex: number;
      };
      characters.splice(startIndex - 1, endIndex - startIndex);
    } else if (request.updateTextStyle) {
      const { range, textStyle, fields } = request.updateTextStyle as {
        range: { startIndex: number; endIndex: number };
        textStyle: Style;
        fields: string;
      };
      for (let i = range.startIndex - 1; i < range.endIndex - 1; i++) {
        const style: Record<string, unknown> = { ...characters[i].style };
        for (const field of fields.split(",")) {
          if (field in textStyle) style[field] = textStyle[field];
          else delete style[field];
        }
        characters[i] = { c: characters[i].c, style };
      }
    } else {
      throw new Error(`Unsupported fake request: ${Object.keys(request)}`);
    }
  }

  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url.replace(/\?.*$/, "")}`);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-token");
    if ((init?.method ?? "GET") === "GET") {
      assert.match(url, /includeTabsContent=true/);
      assert.match(url, /suggestionsViewMode=SUGGESTIONS_INLINE/);
      return Promise.resolve(Response.json({
        documentId: "fake-document",
        title,
        revisionId: `rev-${revision}`,
        suggestionsViewMode: "SUGGESTIONS_INLINE",
        tabs: [{
          tabProperties: { tabId: "t.0" },
          documentTab: { body: { content: body() } },
        }],
      }));
    }
    const payload = JSON.parse(String(init?.body));
    if (payload.writeControl?.requiredRevisionId !== `rev-${revision}`) {
      return Promise.resolve(Response.json({
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message:
            "The required revision ID 'x' does not match the latest revision.",
        },
      }, { status: 400 }));
    }
    const saved = characters;
    characters = [...characters];
    try {
      for (const request of payload.requests) apply(request);
    } catch (error) {
      characters = saved;
      throw error;
    }
    revision++;
    return Promise.resolve(Response.json({ replies: [] }));
  };

  return { fetch, requests, text: () => characters.map((c) => c.c).join("") };
}

function transportFor(fake: ReturnType<typeof fakeGoogleDocs>) {
  return createGoogleDocsRestTransport({
    getAccessToken: () => "test-token",
    fetch: fake.fetch as typeof globalThis.fetch,
  });
}

Deno.test("live check scenario passes against a simulated Google Docs service", async () => {
  const fake = fakeGoogleDocs("orthotypography-live-check 2026-10-19");
  const messages: string[] = [];
  const report = await runLiveCheck(transportFor(fake), "fake-document", {
    log: (message) => messages.push(message),
  });
  assert.equal(report.failure, undefined, messages.join("\n"));
  assert.equal(report.ok, true);
  assert.deepEqual(report.steps.map((step) => step.name), [
    "setup",
    "review-pass",
    "partial-commit",
    "dismissed-then-styled-commit",
    "dismissal-kept",
    "stale-review",
    "idempotence",
    "final-text",
  ]);
  // The report carries no identifiers or credentials.
  const serialized = JSON.stringify(report);
  for (const secret of ["fake-document", "rev-", "test-token", "t.0"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.ok(fake.requests.some((request) => request.endsWith(":batchUpdate")));
});

Deno.test("live check refuses a document that is not a throwaway check document", async () => {
  const fake = fakeGoogleDocs("Quarterly report");
  const report = await runLiveCheck(transportFor(fake), "fake-document", {
    log: () => {},
  });
  assert.equal(report.ok, false);
  assert.match(report.failure!, /title starts with/);
  assert.deepEqual(report.steps, []);
  assert.equal(
    fake.requests.filter((request) => request.startsWith("POST")).length,
    0,
  );
  assert.equal(fake.text(), "\n");
});
