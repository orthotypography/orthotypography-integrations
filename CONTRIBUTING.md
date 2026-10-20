# Contributing to Orthotypography integrations

Thank you for helping improve Orthotypography integrations.

## Where a change belongs

This repository adapts the published
[orthotypography engine](https://github.com/orthotypography/orthotypography) to
other tools. It contains four packages:

| Package                                               | Purpose                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| [`@orthotypography/rehype`](packages/rehype/)         | Unified and rehype plugin                       |
| [`@orthotypography/satteri`](packages/satteri/)       | native Sätteri HAST hooks                       |
| [`@orthotypography/astro`](packages/astro/)           | Astro integration for either Markdown processor |
| [`@orthotypography/editor-sdk`](packages/editor-sdk/) | neutral document editor contract                |

Typographic rules, the documentary catalogue, presets, diagnostics, and text
changes belong in the engine repository. Integrations never re-implement or
patch a rule; they preserve the host's document structure and translate the
engine's results to it. Propose rule changes in the engine repository.

For substantial changes, open an issue first so that the expected behavior,
affected packages, and compatibility requirements can be discussed before
implementation.

## Setting up

You need:

- [Deno 2](https://docs.deno.com/runtime/getting_started/installation/), the
  canonical development environment;
- Node.js 22 or later with npm, only for the npm package checks.

There is no install step. Deno downloads the JSR and npm dependencies on first
use, so the first run needs access to `jsr.io` and `registry.npmjs.org`. Deno is
not required to consume the published packages, and source code must remain
portable to the supported JavaScript runtimes.

The repository is a Deno workspace:

- `deno.json` declares the workspace, the shared dependency versions, and the
  tasks;
- `packages/<name>/deno.json` declares each package's name, version, and
  exports; the editor SDK also declares its own core version and tasks;
- `scripts/` holds the npm build, smoke tests, and release scripts;
- `docs/` holds design notes and the roadmap, the only place where French is
  accepted;
- `npm/` receives the generated npm packages and is ignored by Git.

Dependencies use exact versions and no lockfile. `minimumDependencyAge` refuses
packages published less than one day ago, except `@orthotypography/core`. The
Markdown adapters and the editor SDK pin their own core versions, in `deno.json`
and `packages/editor-sdk/deno.json` respectively, either to a published version
or to an immutable development commit (see below). Do not align them, or change
either, outside a dedicated pull request.

## Deno tasks

Run tasks from the repository root.

| Task                            | What it does                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `deno task check`               | format check, lint, type check of the Markdown adapters, their tests, and the scripts, and API documentation          |
| `deno task test`                | rehype, Sätteri, and Astro tests                                                                                      |
| `deno task editor:check`        | the same checks for the editor SDK                                                                                    |
| `deno task editor:test`         | editor SDK tests, which `deno task test` does not run                                                                 |
| `deno task publish:check`       | JSR publication dry run for the four packages; `publish:check:adapters` and `publish:check:editor-sdk` check one lane |
| `deno task core:status`         | reports whether each lane depends on a published core or on a development commit                                      |
| `deno task npm:check`           | builds every npm package into `npm/`, smoke-tests them under Node, and runs pack dry runs                             |
| `deno task npm:build:<package>` | builds one npm package: `rehype`, `satteri`, `astro`, or `editor-sdk`                                                 |

Choose the checks by the kind of change:

- Markdown or Astro adapters: `deno task check` and `deno task test`.
- Editor SDK: `deno task editor:check` and `deno task editor:test`.
- Editor SDK packaging: `deno task npm:build:editor-sdk`,
  `node scripts/npm_editor_smoke.mjs`, and
  `node scripts/npm_editor_pack_check.mjs`.
- Dependencies, exports, manifests, or shared scripts:
  `deno task publish:check`, `deno task npm:check`, and the test tasks of every
  affected package.
- Documentation only: check links and factual claims, and format the changed
  Markdown.

A lane pinned to a development core commit cannot pass the JSR and npm checks;
run its other checks and report the packaging checks as not applicable (see
[Trying an unreleased engine](#trying-an-unreleased-engine)).

A few practical notes:

- `deno fmt` fixes what `deno fmt --check` reports. The formatter configuration
  excludes Markdown, so format changed Markdown files explicitly, for example
  `deno fmt CONTRIBUTING.md`.
- To run one test file, pass it to `deno test`. The Sätteri and Astro tests need
  the same permissions as the task:
  `deno test --allow-env --allow-sys --allow-ffi packages/astro/tests/integration_test.ts`.
  Editor SDK tests run from their package:
  `cd packages/editor-sdk && deno test tests/plan_test.ts`.
- CI runs `check`, `test`, the editor SDK checks, and, for each lane pinned to a
  published core, the JSR dry runs and npm package checks on every pull request.

## Trying an unreleased engine

To try an engine change locally, point the `@orthotypography/core` import of the
package you are testing to the `src/mod.ts` file of a local engine checkout, run
the tests, and restore the import before committing. Report such local runs
separately from the checks against the pinned version.

A lane may adopt an unreleased engine line in a dedicated pull request by
pinning an immutable development dependency: the `src/mod.ts` file of a full
commit SHA of the core repository, for example
`https://raw.githubusercontent.com/orthotypography/orthotypography/<sha>/src/mod.ts`.
Branch names, tags, abbreviated SHAs, and local paths are rejected. Record the
commit, the core pull requests it contains, and the planned move to a published
core in `docs/roadmap.md`. `deno task core:status` reports the dependency of
each lane, and `scripts/build_npm.ts` refuses to package a lane pinned to a
development commit; JSR rejects such an import as well. CI therefore skips the
JSR dry runs and npm package checks of that lane, and the lane cannot be
released until it depends on a published core again.

## Tests

Cover positive cases, negative cases, protected content, and text split across
inline nodes, and check idempotence where applicable.

- The Markdown adapters must preserve the host's configured processor, logical
  text runs, inline node structure, and protected content such as `code`, `pre`,
  `script`, `style`, and raw HTML. Edits use the engine's source-coordinate text
  changes.
- The editor SDK keeps plans and batches immutable and complete, validates
  revisions and source context, and rejects unsupported native structures
  explicitly. It contains no editor-specific API.
- Fixtures must be sanitized. Never commit or log credentials, tokens, or
  private document content; credentials belong to the host application.
- Offline tests do not establish live editor compatibility. Report live
  validation separately and describe its exact scenario.

## Pull requests

Work on a dedicated branch based on the current `main` and keep each pull
request focused on one task. Describe the checks you ran and any known
limitation. Add user-facing changes to the `Unreleased` section of
[`CHANGELOG.md`](CHANGELOG.md). Package versions change only in release pull
requests; see [`RELEASING.md`](RELEASING.md).

Code, comments, API documentation, tests, commit messages, pull requests, and
the other repository files are written in English. French is accepted only in
`docs/`, and as linguistic data under test.

## License of contributions

By submitting a contribution to this repository, you agree that your
contribution is licensed under the MIT License that applies to this project.

You represent that you have the right to submit the contribution under those
terms. If you contribute on behalf of an employer or another organization, you
are responsible for ensuring that you have the necessary authorization.

See [LICENSE](LICENSE) for the complete license text.
