import assert from "node:assert/strict";
import {
  type RuntimeRule,
  SAFE_PUNCTUATION_RULES,
} from "@orthotypography/core";
import {
  isUnifiedProcessor,
  markdownConfigDefaults,
  unified,
} from "@astrojs/markdown-remark";
import { isSatteriProcessor, satteri } from "@astrojs/markdown-satteri";
import type { AstroIntegration } from "astro";
import orthotypography, {
  type AstroOrthotypographyOptions,
} from "../src/mod.ts";

const runner: NonNullable<
  AstroOrthotypographyOptions["runTextNodePipeline"]
> = (
  nodes,
) => ({
  value: nodes.map(({ value }) => value).join(""),
  nodes,
  changes: [],
  diagnostics: [],
  appliedRuleIds: [],
});
const testRule = {} as RuntimeRule;

function setup(
  integration: AstroIntegration,
  processor:
    | ReturnType<typeof satteri>
    | ReturnType<typeof unified> = satteri(),
): Record<string, unknown> {
  let update: Record<string, unknown> | undefined;
  const hook = integration.hooks["astro:config:setup"];
  assert.equal(typeof hook, "function");
  hook!({
    config: { markdown: { processor } },
    updateConfig(value: Record<string, unknown>) {
      update = value as Record<string, unknown>;
      return value as never;
    },
  } as never);
  if (update === undefined) {
    throw new Error("Astro integration did not update the configuration");
  }
  return update;
}

Deno.test("Astro integration selects Unified and appends the rehype adapter", () => {
  const previousPlugin = () => undefined;
  const integration = orthotypography({
    runTextNodePipeline: runner,
    rules: [testRule],
    locale: "fr-FR",
    mode: "lint",
    processorOptions: {
      gfm: false,
      rehypePlugins: [previousPlugin],
    },
  });

  assert.equal(integration.name, "@orthotypography/astro");
  const update = setup(integration);
  const processor = (update.markdown as {
    processor: ReturnType<typeof unified>;
  }).processor;

  assert.ok(isUnifiedProcessor(processor));
  assert.equal(processor.options.gfm, false);
  assert.equal(processor.options.rehypePlugins.length, 2);
  assert.equal(processor.options.rehypePlugins[0], previousPlugin);
  const addedPlugin = processor.options.rehypePlugins[1];
  assert.ok(Array.isArray(addedPlugin));
  assert.equal(typeof addedPlugin[0], "function");
  assert.equal(
    (addedPlugin[0] as { readonly name: string }).name,
    "rehypeOrthotypography",
  );
});

Deno.test("each integration owns an isolated processor configuration", () => {
  const options = {
    runTextNodePipeline: runner,
    rules: [testRule],
    locale: "fr-FR",
    mode: "fix",
  } satisfies AstroOrthotypographyOptions;

  const first = (setup(orthotypography(options), unified()).markdown as {
    processor: { options: { rehypePlugins: unknown[] } };
  }).processor;
  const second = (setup(orthotypography(options), unified()).markdown as {
    processor: { options: { rehypePlugins: unknown[] } };
  }).processor;

  assert.notEqual(first, second);
  assert.notEqual(first.options.rehypePlugins, second.options.rehypePlugins);
  assert.equal(first.options.rehypePlugins.length, 1);
  assert.equal(second.options.rehypePlugins.length, 1);
});

Deno.test("Astro integration preserves Sätteri and appends its native plugin", async () => {
  const processor = satteri({ features: { smartPunctuation: false } });
  const integration = orthotypography({
    rules: SAFE_PUNCTUATION_RULES,
    locale: "fr-FR",
    mode: "fix",
  });
  const update = setup(integration, processor);
  const configured = (update.markdown as { processor: typeof processor })
    .processor;

  assert.equal(configured, processor);
  assert.ok(isSatteriProcessor(configured));
  assert.equal(configured.options.hastPlugins.length, 1);
  const renderer = await configured.createRenderer(markdownConfigDefaults);
  const result = await renderer.render("Bonjour , monde.");
  assert.equal(result.code.trim(), "<p>Bonjour, monde.</p>");
});

Deno.test("Astro integration preserves an explicit Unified processor", () => {
  const processor = unified({ smartypants: false });
  const update = setup(
    orthotypography({
      rules: SAFE_PUNCTUATION_RULES,
      locale: "fr-FR",
      mode: "fix",
    }),
    processor,
  );
  const configured = (update.markdown as { processor: typeof processor })
    .processor;

  assert.equal(configured, processor);
  assert.ok(isUnifiedProcessor(configured));
  assert.equal(configured.options.rehypePlugins.length, 1);
});

Deno.test("Astro's Unified renderer applies the core", async () => {
  const update = setup(orthotypography({
    rules: SAFE_PUNCTUATION_RULES,
    locale: "fr-FR",
    mode: "fix",
    processorOptions: { smartypants: false },
  }));
  const processor = (update.markdown as {
    processor: ReturnType<typeof unified>;
  }).processor;
  const renderer = await processor.createRenderer(markdownConfigDefaults);
  const result = await renderer.render("Bonjour , monde.");

  assert.equal(result.code.trim(), "<p>Bonjour, monde.</p>");
});
