import assert from "node:assert/strict";
import { parseCoreDependency } from "../../../scripts/core_dependency.ts";

const commit = "82e4cc97e3e97dfddc37ec9c1aacc33f07b3d229";

Deno.test("core dependency distinguishes published and development pins", () => {
  assert.deepEqual(
    parseCoreDependency("jsr:@orthotypography/core@0.1.0-alpha.3"),
    { kind: "published", version: "0.1.0-alpha.3" },
  );
  assert.deepEqual(
    parseCoreDependency(
      `https://raw.githubusercontent.com/orthotypography/orthotypography/${commit}/src/mod.ts`,
    ),
    { kind: "development", commit },
  );
});

Deno.test("core dependency rejects mutable or inexact references", () => {
  for (
    const specifier of [
      "jsr:@orthotypography/core@^0.1.0",
      "jsr:@orthotypography/core",
      "https://raw.githubusercontent.com/orthotypography/orthotypography/main/src/mod.ts",
      `https://raw.githubusercontent.com/orthotypography/orthotypography/${
        commit.slice(0, 7)
      }/src/mod.ts`,
      `https://raw.githubusercontent.com/someone/orthotypography/${commit}/src/mod.ts`,
      "../orthotypography/src/mod.ts",
    ]
  ) {
    assert.throws(() => parseCoreDependency(specifier), Error, specifier);
  }
});
