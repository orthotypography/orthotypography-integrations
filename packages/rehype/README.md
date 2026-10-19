# `@orthotypography/rehype`

A rehype adapter that applies an orthotypographic engine to sequences of HAST
text nodes without changing the tree structure.

This is an alpha release. Its API may change before `1.0.0`.

## Installation

```sh
npm install @orthotypography/core @orthotypography/rehype
```

With Deno or another JSR client:

```sh
deno add jsr:@orthotypography/core@0.2.0-alpha.0 jsr:@orthotypography/rehype@0.2.0-alpha.0
```

## Usage

The package uses `@orthotypography/core` directly while keeping the adapter's
tree policy independently testable:

```ts
import { IMPRIMERIE_NATIONALE_RULES } from "@orthotypography/core";
import { rehypeOrthotypography } from "@orthotypography/rehype";

const plugin = rehypeOrthotypography({
  rules: IMPRIMERIE_NATIONALE_RULES,
  locale: "fr-FR",
  mode: "lint",
});
```

Modes are intentionally explicit: `lint` produces diagnostics associated with
their `segmentId`, while `fix` replaces node values and exposes
source-coordinate changes through `onChange` and
`file.data.orthotypographyChanges`. Block elements, raw HTML, and `code`, `pre`,
`script`, and `style` form boundaries. The `exclude` and `protect` predicates
let an integration adjust this policy. Diagnostics are located in the source
text nodes in both modes: `segmentValue` is the node's text before any fix, and
a subject inside text produced by an earlier fix is reported on the source range
of that fix. Change IDs and the `groupId` and `changeIds` of diagnostics are
unique within one logical run only; the adapter applies every change of a run
and does not expose proposal groups.
