import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function esmTarget(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    return esmTarget(entry.import) ?? esmTarget(entry.default);
  }
}

const packageJson = JSON.parse(
  await readFile("npm/editor-sdk/package.json", "utf8"),
);
const editorConfig = JSON.parse(
  await readFile("packages/editor-sdk/deno.json", "utf8"),
);

async function importEntry(exportName) {
  const target = esmTarget(packageJson.exports[exportName]);
  assert.equal(typeof target, "string", `${exportName} must expose ESM`);
  return await import(pathToFileURL(`npm/editor-sdk/${target}`).href);
}

const editorSdk = await importEntry(".");
assert.equal(typeof editorSdk.prepareDocumentPlan, "function");
assert.equal(typeof editorSdk.createMemoryDocument, "function");

assert.deepEqual(Object.keys(packageJson.exports), ["."]);

assert.equal(packageJson.name, "@orthotypography/editor-sdk");
assert.equal(packageJson.version, editorConfig.version);
assert.equal(
  packageJson.dependencies["@orthotypography/core"],
  editorConfig.imports["@orthotypography/core"].replace(
    /^jsr:@orthotypography\/core@/,
    "",
  ),
);
