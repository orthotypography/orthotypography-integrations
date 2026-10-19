# `@orthotypography/satteri`

A native Sätteri HAST plugin that applies source-backed orthotypographic rules
without switching an Astro 7 project to Unified.

This is an alpha release. Its API may change before `1.0.0`.

## Installation

```sh
npm install @orthotypography/core @orthotypography/satteri satteri
```

With Deno or another JSR client:

```sh
deno add jsr:@orthotypography/core@0.1.0-alpha.3 jsr:@orthotypography/satteri@0.1.0-alpha.2 npm:satteri@0.10.5
```

## Usage

```ts
import { IMPRIMERIE_NATIONALE_RULES } from "@orthotypography/core";
import { satteriOrthotypography } from "@orthotypography/satteri";
import { markdownToHtml } from "satteri";

const result = await markdownToHtml("Bonjour !", {
  hastPlugins: [
    satteriOrthotypography({
      rules: IMPRIMERIE_NATIONALE_RULES,
      locale: "fr-FR",
      mode: "fix",
    }),
  ],
});
```

The plugin processes logical text runs across inline HAST nodes while preserving
block boundaries, raw HTML, and `code`, `pre`, `script`, and `style` elements.
Diagnostics are passed to `onDiagnostic`, reported through Sätteri, and stored
in `result.data.orthotypographyDiagnostics` for direct Sätteri consumers.
Source-coordinate fixes are passed to `onChange` and stored in
`result.data.orthotypographyChanges`. Diagnostics are located in the source text
nodes in both modes: `segmentValue` is the node's text before any fix, and a
subject inside text produced by an earlier fix is reported on the source range
of that fix. Change IDs and the `groupId` and `changeIds` of diagnostics are
unique within one logical run only; the adapter applies every change of a run
and does not expose proposal groups.
