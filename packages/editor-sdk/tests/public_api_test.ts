import assert from "node:assert/strict";
import {
  createMemoryDocument,
  prepareDocumentPlan,
  validateDocumentPlan,
} from "../mod.ts";
import config from "../deno.json" with { type: "json" };

Deno.test("the public entry point exposes supported APIs", () => {
  for (
    const value of [
      createMemoryDocument,
      prepareDocumentPlan,
      validateDocumentPlan,
    ]
  ) {
    assert.equal(typeof value, "function");
  }
});

Deno.test("the package declares only the neutral entry point", () => {
  assert.deepEqual(config.exports, { ".": "./mod.ts" });
});
