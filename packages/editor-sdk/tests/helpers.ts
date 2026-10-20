import type { RunEdit, RuntimeRule } from "@orthotypography/core";

/**
 * External rule that proposes fixed edits, in logical-run coordinates, as one
 * proposal located on the range they cover. Its ID is outside the catalogue.
 */
export function syntheticRule(
  edits: readonly RunEdit[],
  options: { readonly id?: string; readonly suggested?: boolean } = {},
): RuntimeRule {
  return {
    id: options.id ?? "x-test.synthetic",
    phase: "cleanup",
    locales: ["fr-FR"],
    defaultMode: options.suggested === false ? "manual-review" : "fix",
    apply: () =>
      edits.length === 0 ? {} : {
        diagnostics: [{
          start: Math.min(...edits.map((edit) => edit.start)),
          end: Math.max(...edits.map((edit) => edit.end)),
          message: "Synthetic proposal",
          edits,
        }],
      },
  };
}
