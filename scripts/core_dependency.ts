import rootConfig from "../deno.json" with { type: "json" };
import editorSdkConfig from "../packages/editor-sdk/deno.json" with {
  type: "json",
};

/**
 * Core dependency of one release lane: a published JSR version, or an
 * immutable development commit of the core repository that cannot be
 * published.
 */
export type CoreDependency =
  | { readonly kind: "published"; readonly version: string }
  | { readonly kind: "development"; readonly commit: string };

const publishedPrefix = "jsr:@orthotypography/core@";
const developmentPattern =
  /^https:\/\/raw\.githubusercontent\.com\/orthotypography\/orthotypography\/([0-9a-f]{40})\/src\/mod\.ts$/;

/** Classifies a core import specifier, rejecting any mutable reference. */
export function parseCoreDependency(specifier: string): CoreDependency {
  if (specifier.startsWith(publishedPrefix)) {
    const version = specifier.slice(publishedPrefix.length);
    if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      return { kind: "published", version };
    }
  }
  const commit = developmentPattern.exec(specifier)?.[1];
  if (commit !== undefined) return { kind: "development", commit };
  throw new Error(
    `Core must be pinned to an exact version or a full commit SHA: ${specifier}`,
  );
}

/** Core dependencies of the adapter and editor SDK release lanes. */
export function laneCoreDependencies(): {
  readonly adapters: CoreDependency;
  readonly editorSdk: CoreDependency;
} {
  return {
    adapters: parseCoreDependency(rootConfig.imports["@orthotypography/core"]),
    editorSdk: parseCoreDependency(
      editorSdkConfig.imports["@orthotypography/core"],
    ),
  };
}

if (import.meta.main) {
  const { adapters, editorSdk } = laneCoreDependencies();
  const describe = (dependency: CoreDependency): string =>
    dependency.kind === "published"
      ? `published core ${dependency.version}`
      : `development core commit ${dependency.commit}`;
  console.log(`Adapters: ${describe(adapters)}`);
  console.log(`Editor SDK: ${describe(editorSdk)}`);
  const outputPath = Deno.env.get("GITHUB_OUTPUT");
  if (outputPath !== undefined) {
    await Deno.writeTextFile(
      outputPath,
      `adapters=${adapters.kind}\neditor_sdk=${editorSdk.kind}\n`,
      { append: true },
    );
  }
}
