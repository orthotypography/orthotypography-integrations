import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const rootConfig = JSON.parse(await readFile("deno.json", "utf8"));
const adapterCoreVersion = rootConfig.imports["@orthotypography/core"]
  .replace(/^jsr:@orthotypography\/core@/, "");
const editorConfig = JSON.parse(
  await readFile("packages/editor-sdk/deno.json", "utf8"),
);
const editorCoreVersion = editorConfig.imports["@orthotypography/core"]
  .replace(/^jsr:@orthotypography\/core@/, "");

function esmTarget(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    return esmTarget(entry.import) ?? esmTarget(entry.default);
  }
}

async function importPackage(directory, exportName = ".") {
  const packageJson = JSON.parse(
    await readFile(`npm/${directory}/package.json`, "utf8"),
  );
  const target = esmTarget(packageJson.exports[exportName]);
  assert.equal(typeof target, "string", "npm package must expose an ESM entry");
  const module = await import(pathToFileURL(`npm/${directory}/${target}`).href);
  return { module, packageJson };
}

const lanes = ["adapters", "editor-sdk"];
const selectedLane = process.argv[2];
if (selectedLane !== undefined && !lanes.includes(selectedLane)) {
  throw new Error(`Unknown release lane: ${selectedLane}`);
}

if (selectedLane === undefined || selectedLane === "adapters") {
  const rehype = await importPackage("rehype");
  assert.equal(typeof rehype.module.rehypeOrthotypography, "function");
  assert.equal(
    rehype.packageJson.dependencies["@orthotypography/core"],
    adapterCoreVersion,
  );

  const satteri = await importPackage("satteri");
  assert.equal(typeof satteri.module.satteriOrthotypography, "function");
  assert.equal(
    satteri.packageJson.dependencies["@orthotypography/core"],
    adapterCoreVersion,
  );
  assert.equal(satteri.packageJson.dependencies.satteri, "^0.10.5");

  const astro = await importPackage("astro");
  assert.equal(typeof astro.module.default, "function");
  assert.equal(typeof astro.module.orthotypography, "function");
  assert.equal(
    astro.packageJson.dependencies["@orthotypography/rehype"],
    astro.packageJson.version,
  );
  assert.equal(
    astro.packageJson.dependencies["@orthotypography/satteri"],
    astro.packageJson.version,
  );
  assert.equal(astro.packageJson.peerDependencies.astro, "^7.0.0");
}

if (selectedLane === undefined || selectedLane === "editor-sdk") {
  const editorSdk = await importPackage("editor-sdk");
  assert.equal(typeof editorSdk.module.prepareDocumentPlan, "function");
  assert.equal(typeof editorSdk.module.createMemoryDocument, "function");
  assert.equal(
    editorSdk.packageJson.dependencies["@orthotypography/core"],
    editorCoreVersion,
  );
}
