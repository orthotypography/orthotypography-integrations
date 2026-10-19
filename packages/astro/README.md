# `@orthotypography/astro`

An Astro integration that applies orthotypographic rules to Markdown and MDX
while preserving Astro 7's configured Sätteri or Unified processor.

This is an alpha release. Its API may change before `1.0.0`.

## Installation

```sh
npm install @orthotypography/core @orthotypography/astro
```

With Deno or another JSR client:

```sh
deno add jsr:@orthotypography/core@0.2.0-alpha.0 jsr:@orthotypography/astro@0.2.0-alpha.0
```

## Usage

```ts
import { IMPRIMERIE_NATIONALE_RULES } from "@orthotypography/core";
import orthotypography from "@orthotypography/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    orthotypography({
      rules: IMPRIMERIE_NATIONALE_RULES,
      locale: "fr-FR",
      mode: "lint",
    }),
  ],
});
```

The integration detects Astro's current Markdown processor. It appends the
native `@orthotypography/satteri` plugin to Sätteri, including Astro 7's
default, or `@orthotypography/rehype` to an explicitly configured Unified
processor. Existing processor features and plugins are preserved.

Passing the legacy `processorOptions` option explicitly selects Unified and
places its remark or rehype plugins before orthotypography. This compatibility
path is useful while migrating an existing alpha configuration, but new projects
should configure their processor directly through Astro.

The official MDX integration inherits the Markdown configuration by default. If
`extendMarkdownConfig` is disabled or MDX receives its own processor, the
configuration must be reproduced there explicitly.

Modes remain required. `lint` collects diagnostics without modifying content;
`fix` replaces allowed text-node values and exposes source-coordinate changes
through the selected HAST adapter.
