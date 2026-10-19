# Agent instructions

This workspace owns the rehype, Sätteri, Astro, and document-editor SDK
packages. Core rules belong in
[orthotypography](https://github.com/orthotypography/orthotypography).

## Language

French is accepted only in `docs/`. Write all authored prose outside `docs/` in
English, including this file, every README, root-level documentation, code
comments, API documentation, and test descriptions. Use English for commit
messages and pull request descriptions. Preserve language-specific text under
test, source titles, and identifiers as data; this does not permit French
explanatory prose outside `docs/`. Track existing violations in the roadmap and
address them in scoped changes.

## Repository workflow

- Read `docs/roadmap.md` and the relevant source and tests before starting.
  Verify claims against the repository and releases; chat summaries can be
  stale.
- Git history has previously been rewritten. Before any edit, verify the current
  remote target branch SHA and base the work on that exact history. Preserve
  unrelated local changes; use a fresh checkout or worktree when needed.
- Recheck the remote head before pushing. If it moved, integrate the new state
  and review the result. Never force-push or restore an obsolete snapshot.
- Keep each task and commit focused. Use a dedicated branch and a reviewable PR
  for implementation unless the user explicitly authorizes a direct push.
- Record public API decisions and cross-repository dependencies in the issue or
  documentation. Coordinate changes to shared configuration and release scripts.
- Update the roadmap when a milestone changes. Distinguish planned, implemented,
  validated offline, validated live, and published; link supporting evidence.
- Complete implementation, appropriate validation, and documentation within the
  authorized scope. Report actual checks, failures, and remaining limitations. A
  green test run does not establish live editor compatibility or publication.
- Follow `RELEASING.md` for releases. Publishing packages requires authorization
  covering that release; a documentation push does not authorize publication.

## Runtime and design

Target the JavaScript ecosystem, including browsers and server runtimes. Deno 2
is the canonical development environment, not a required consumer runtime. Keep
runtime-specific facilities at explicit boundaries. Preserve deterministic,
source-backed rules, protected content, source coordinates, and atomic edits. Do
not introduce a model service into the normalization engine.

## Integration boundaries

- Preserve the host's configured Sätteri or Unified/Rehype processor, logical
  text runs, protected content, and inline node structure.
- Use source-coordinate `TextChange` sets for edits, not diagnostic replacement
  strings or whole-node preview replacement.
- Keep the editor SDK's neutral entry point independent of editor providers.
  Google Docs extraction, native ranges, styles, and transport belong in its
  dedicated `./google-docs` entry point.
- Validate full snapshot context and revision. Recheck the revision inside the
  native atomic transaction; preflight validation alone cannot prevent races.
- Preserve complete batches and nominal, immutable plan/review objects. Do not
  silently support partial acceptance, reconstruction, replay, or stale retries.
- Reject unsupported native structures and style operations explicitly. Keep
  live validation claims bounded by the recorded scenarios.
- Credential acquisition, refresh, and storage belong to the host application.
  Never commit or log credentials or unsanitized private document fixtures.

## Package and release boundaries

Astro adapters share the `v<version>` release lane. The editor SDK has its own
`editor-sdk-v<version>` lane. Do not synchronize their versions or core
dependencies implicitly. Consult current package manifests and release workflows
before changing either lane.

Each lane depends on a published core version or on an explicitly documented
immutable development dependency: a full core commit SHA, recorded in the
roadmap with the core pull requests it contains. A lane on a development
dependency cannot be packaged or released; move it to the published core in a
dedicated pull request once publication is authorized.

## Validation

- Markdown/Astro changes: `deno task check` and `deno task test`.
- SDK changes: `deno task editor:check` and `deno task editor:test`. The root
  test task does not run SDK tests.
- SDK packaging: `deno task npm:build:editor-sdk`,
  `node scripts/npm_editor_smoke.mjs`, and
  `node scripts/npm_editor_pack_check.mjs`.
- Shared packaging changes: `deno task publish:check` and `deno task npm:check`,
  plus both affected test lanes.
- For documentation-only changes, inspect Markdown, links, and factual claims.
  The root formatter configuration does not include Markdown, so check changed
  Markdown explicitly. Report live checks separately from offline fixtures.
