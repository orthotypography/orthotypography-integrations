import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const { stdout } = await execFileAsync(
  "npm",
  ["pack", "--dry-run", "--json"],
  { cwd: "npm/editor-sdk", maxBuffer: 1024 * 1024 },
);
const [pack] = JSON.parse(stdout);
const files = pack.files.map((file) => file.path);

for (
  const expected of [
    "LICENSE",
    "README.md",
    "package.json",
    "esm/mod.js",
    "types/mod.d.ts",
  ]
) {
  assert.ok(files.includes(expected), `npm archive is missing ${expected}`);
}
assert.equal(files.some((path) => /(^|\/)tests?\//u.test(path)), false);
assert.equal(files.some((path) => /(^|\/)fixtures?\//u.test(path)), false);
assert.equal(files.some((path) => /google[-_]docs/u.test(path)), false);
