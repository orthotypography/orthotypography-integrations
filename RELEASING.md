# Releasing

Publishing requires explicit authorization covering the release. Merging a pull
request, a green CI run, or a documentation change does not authorize
publication.

Each package keeps the same name and version on JSR and npm. Publication is
triggered by a published GitHub release and stays blocked while the repository
variable `PUBLISH_ENABLED` is not `true`.

The repository has two independent release lanes:

- `v<version>` publishes `rehype`, `satteri`, and `astro` together at their
  shared version through `.github/workflows/publish.yml`;
- `editor-sdk-v<version>` publishes only `editor-sdk` through
  `.github/workflows/publish-editor-sdk.yml`.

A release in one lane never checks, builds, or publishes a package of the other
lane.

A lane pinned to a development core commit (see `CONTRIBUTING.md`) cannot be
released: JSR rejects the import, and `scripts/build_npm.ts` refuses to package
it. Pin a published core version in a dedicated pull request first.

## Publication setup

- Each package is linked to this repository on JSR, which publishes with the
  workflow's short-lived OIDC token; no JSR secret is used.
- Each npm package publishes through trusted publishing (OIDC). The trusted
  publisher of `@orthotypography/rehype`, `@orthotypography/satteri`, and
  `@orthotypography/astro` is `publish.yml`; the trusted publisher of
  `@orthotypography/editor-sdk` is `publish-editor-sdk.yml`. Both use the
  `release` environment. No npm token is stored in the repository or its
  environments. The workflows install npm `11.5.1` or later on Node `22.14.0` or
  later for this purpose, and npm attaches provenance to each version.
- Keep the `release` environment protected and restricted to release tags.
- Keep `PUBLISH_ENABLED` absent or `false` outside an authorized publication
  window.

Renaming a Publish workflow file or the `release` environment breaks npm trusted
publishing until the affected packages' trusted publishers are updated on npm.
Transferring or renaming the repository has the same effect on npm for all four
packages and also requires updating each package's linked repository on JSR.

## Markdown and Astro adapters

1. Open a pull request that sets the same version in
   `packages/rehype/deno.json`, `packages/satteri/deno.json`, and
   `packages/astro/deno.json`, and updates `CHANGELOG.md`, the package table in
   `README.md`, and `docs/roadmap.md`. The adapters depend on a published core
   version declared in the root `deno.json`.
2. Before merging, run `deno task check`, `deno task test`,
   `deno task publish:check`, and `deno task npm:check`, and confirm that CI
   passes.
3. Once publication is authorized, create a GitHub release tagged `v<version>`
   on the merged commit, marked as a prerelease for prerelease versions, and set
   `PUBLISH_ENABLED` to `true` for the publication window only.

The workflow requires the three versions to match the tag. `rehype` and
`satteri` are always published before `astro`, which depends on both. The three
packages keep a shared version during the alpha series.

## Editor SDK

`@orthotypography/editor-sdk` has its own version and a single, editor-neutral
entry point.

1. Open a pull request that updates `packages/editor-sdk/deno.json` without
   changing the adapter versions, and updates `CHANGELOG.md`, `README.md`, and
   `docs/roadmap.md`.
2. Before merging, run `deno task editor:check`, `deno task editor:test`,
   `deno task npm:build:editor-sdk`, `node scripts/npm_editor_smoke.mjs`, and
   `node scripts/npm_editor_pack_check.mjs`, and confirm that CI passes.
3. Once publication is authorized, create a GitHub release with the exact tag
   `editor-sdk-v<version>`, for example `editor-sdk-v0.1.0-alpha.1`, and set
   `PUBLISH_ENABLED` to `true` for the publication window only.

## npm distribution tags

npm trusted publishing cannot change distribution tags after publication, so
`scripts/npm_dist_tag.ts` selects the tag passed to `npm publish` in both lanes:

- every `0.x` version, prereleases included, is published as `latest`, so that
  an unversioned `npm install` resolves to the newest preview;
- from `1.0.0`, stable versions are published as `latest`, and prereleases as
  `alpha`, `beta`, or `next`, so they never displace a stable version.

The final workflow step fails unless npm reports the selected tag on each
published version. An explicit `--tag latest` also moves `latest` to a lower
version, so never publish an older `0.x` version after a newer one.

The `alpha` tags used by the first previews are no longer updated. Removing them
is a manual registry operation, for example:

```sh
npm dist-tag rm @orthotypography/rehype alpha
```

## Partial publication recovery

Before each write, the workflows check the exact version of each package on JSR
and npm separately. A version already present is left untouched; only the
missing package-registry pairs are published. The final step waits until every
expected version is visible with its selected npm distribution tag.

To resume a partial publication, rerun the failed workflow or dispatch `Publish`
or `Publish editor SDK` manually with the existing release tag. The tag must
still match the versions declared in the package manifests, and
`PUBLISH_ENABLED` must be `true`. Never increment a version merely to recover a
missing registry, and verify that an existing version belongs to this release
before resuming: the workflows treat it as immutable and never republish it.
