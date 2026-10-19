import { build, emptyDir } from "@deno/dnt";
import astroConfig from "../packages/astro/deno.json" with { type: "json" };
import editorSdkConfig from "../packages/editor-sdk/deno.json" with {
  type: "json",
};
import rehypeConfig from "../packages/rehype/deno.json" with { type: "json" };
import satteriConfig from "../packages/satteri/deno.json" with {
  type: "json",
};
import {
  type CoreDependency,
  laneCoreDependencies,
} from "./core_dependency.ts";

type PackageName = "rehype" | "satteri" | "astro" | "editor-sdk";

/** Reads the published core version of a lane; development pins cannot be packaged. */
function publishedCoreVersion(
  lane: string,
  dependency: CoreDependency,
): string {
  if (dependency.kind === "development") {
    throw new Error(
      `${lane} depend on development core commit ${dependency.commit}; ` +
        "pin a published core version before packaging",
    );
  }
  return dependency.version;
}

const coreDependencies = laneCoreDependencies();
const adapterCoreVersion = (): string =>
  publishedCoreVersion("The adapters", coreDependencies.adapters);
const editorCoreVersion = (): string =>
  publishedCoreVersion("The editor SDK", coreDependencies.editorSdk);

const packageNames: readonly PackageName[] = [
  "rehype",
  "satteri",
  "astro",
  "editor-sdk",
];
const selectedPackage = Deno.args[0] as PackageName | undefined;
if (
  selectedPackage !== undefined && !packageNames.includes(selectedPackage)
) {
  throw new Error(`Unknown npm package: ${selectedPackage}`);
}

await emptyDir(
  selectedPackage === undefined ? "./npm" : `./npm/${selectedPackage}`,
);

async function buildPackage(
  name: PackageName,
  options: () => Parameters<typeof build>[0],
): Promise<void> {
  if (selectedPackage === undefined || selectedPackage === name) {
    await build(options());
  }
}

await buildPackage("rehype", () => ({
  entryPoints: [{ name: ".", path: "./packages/rehype/src/mod.ts" }],
  outDir: "./npm/rehype",
  esModule: true,
  scriptModule: false,
  declaration: "separate",
  declarationMap: true,
  // Source types are checked by `deno task check`; npm:check imports the
  // generated package under Node.
  typeCheck: false,
  test: false,
  compilerOptions: { target: "ES2022" },
  shims: {},
  package: {
    name: rehypeConfig.name,
    version: rehypeConfig.version,
    description: "Rehype adapter for source-backed orthotypography rules",
    author: "Antoine Boquet",
    license: rehypeConfig.license,
    homepage:
      "https://github.com/orthotypography/orthotypography-integrations/tree/main/packages/rehype#readme",
    repository: {
      type: "git",
      url:
        "git+https://github.com/orthotypography/orthotypography-integrations.git",
      directory: "packages/rehype",
    },
    bugs: {
      url:
        "https://github.com/orthotypography/orthotypography-integrations/issues",
    },
    keywords: ["rehype", "typography", "orthotypography", "hast", "unicode"],
    engines: { node: ">=18" },
    sideEffects: false,
    dependencies: {
      "@orthotypography/core": adapterCoreVersion(),
    },
  },
  mappings: {
    "@orthotypography/core": {
      name: "@orthotypography/core",
      version: adapterCoreVersion(),
    },
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/rehype/LICENSE");
    Deno.copyFileSync(
      "packages/rehype/README.md",
      "npm/rehype/README.md",
    );
  },
}));

await buildPackage("satteri", () => ({
  entryPoints: [{ name: ".", path: "./packages/satteri/src/mod.ts" }],
  outDir: "./npm/satteri",
  esModule: true,
  scriptModule: false,
  declaration: "separate",
  declarationMap: true,
  // Source types are checked by `deno task check`; npm:check imports the
  // generated package. Letting dnt type-check Sätteri's N-API dependency can
  // stall while resolving its platform bindings.
  typeCheck: false,
  test: false,
  compilerOptions: { target: "ES2022" },
  shims: {},
  package: {
    name: satteriConfig.name,
    version: satteriConfig.version,
    description:
      "Native Sätteri adapter for source-backed orthotypography rules",
    author: "Antoine Boquet",
    license: satteriConfig.license,
    homepage:
      "https://github.com/orthotypography/orthotypography-integrations/tree/main/packages/satteri#readme",
    repository: {
      type: "git",
      url:
        "git+https://github.com/orthotypography/orthotypography-integrations.git",
      directory: "packages/satteri",
    },
    bugs: {
      url:
        "https://github.com/orthotypography/orthotypography-integrations/issues",
    },
    keywords: ["satteri", "astro", "typography", "orthotypography", "hast"],
    engines: { node: ">=18" },
    sideEffects: false,
    dependencies: {
      "@orthotypography/core": adapterCoreVersion(),
      "satteri": "^0.10.5",
    },
  },
  mappings: {
    "@orthotypography/core": {
      name: "@orthotypography/core",
      version: adapterCoreVersion(),
    },
    "satteri": {
      name: "satteri",
      version: "^0.10.5",
    },
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/satteri/LICENSE");
    Deno.copyFileSync(
      "packages/satteri/README.md",
      "npm/satteri/README.md",
    );
  },
}));

await buildPackage("astro", () => ({
  entryPoints: [{ name: ".", path: "./packages/astro/src/mod.ts" }],
  outDir: "./npm/astro",
  esModule: true,
  scriptModule: false,
  declaration: "separate",
  declarationMap: true,
  // Source types are checked by `deno task check`; npm:check installs the
  // freshly generated adapters before running the Astro smoke test.
  typeCheck: false,
  test: false,
  skipNpmInstall: true,
  compilerOptions: { target: "ES2022" },
  shims: {},
  package: {
    name: astroConfig.name,
    version: astroConfig.version,
    description:
      "Astro integration for source-backed orthotypography rules via Sätteri or rehype",
    author: "Antoine Boquet",
    license: astroConfig.license,
    homepage:
      "https://github.com/orthotypography/orthotypography-integrations/tree/main/packages/astro#readme",
    repository: {
      type: "git",
      url:
        "git+https://github.com/orthotypography/orthotypography-integrations.git",
      directory: "packages/astro",
    },
    bugs: {
      url:
        "https://github.com/orthotypography/orthotypography-integrations/issues",
    },
    keywords: [
      "astro",
      "satteri",
      "rehype",
      "typography",
      "orthotypography",
      "unicode",
    ],
    engines: { node: ">=18" },
    sideEffects: false,
    dependencies: {
      "@astrojs/markdown-remark": "^7.2.4",
      "@astrojs/markdown-satteri": "^0.3.8",
      "@orthotypography/rehype": "file:../rehype",
      "@orthotypography/satteri": "file:../satteri",
    },
    peerDependencies: {
      astro: "^7.0.0",
    },
  },
  mappings: {
    "@orthotypography/rehype": {
      name: "@orthotypography/rehype",
      version: "file:../rehype",
    },
    "@orthotypography/satteri": {
      name: "@orthotypography/satteri",
      version: "file:../satteri",
    },
  },
  postBuild() {
    const packagePath = "npm/astro/package.json";
    const packageJson = JSON.parse(Deno.readTextFileSync(packagePath));
    packageJson.dependencies["@orthotypography/rehype"] = astroConfig.version;
    packageJson.dependencies["@orthotypography/satteri"] = astroConfig.version;
    Deno.writeTextFileSync(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );
    Deno.copyFileSync("LICENSE", "npm/astro/LICENSE");
    Deno.copyFileSync(
      "packages/astro/README.md",
      "npm/astro/README.md",
    );
  },
}));

await buildPackage("editor-sdk", () => ({
  entryPoints: [
    "./packages/editor-sdk/mod.ts",
    {
      name: "./google-docs",
      path: "./packages/editor-sdk/google-docs.ts",
    },
  ],
  outDir: "./npm/editor-sdk",
  esModule: true,
  scriptModule: false,
  declaration: "separate",
  declarationMap: true,
  typeCheck: false,
  test: false,
  compilerOptions: { target: "ES2022" },
  shims: {},
  package: {
    name: editorSdkConfig.name,
    version: editorSdkConfig.version,
    description:
      "Guarded document editor plans and Google Docs transport primitives",
    author: "Antoine Boquet",
    license: editorSdkConfig.license,
    homepage:
      "https://github.com/orthotypography/orthotypography-integrations/tree/main/packages/editor-sdk#readme",
    repository: {
      type: "git",
      url:
        "git+https://github.com/orthotypography/orthotypography-integrations.git",
      directory: "packages/editor-sdk",
    },
    bugs: {
      url:
        "https://github.com/orthotypography/orthotypography-integrations/issues",
    },
    keywords: [
      "editor",
      "google-docs",
      "typography",
      "orthotypography",
      "unicode",
    ],
    engines: { node: ">=18" },
    sideEffects: false,
    dependencies: {
      "@orthotypography/core": editorCoreVersion(),
    },
  },
  mappings: {
    "@orthotypography/core": {
      name: "@orthotypography/core",
      version: editorCoreVersion(),
    },
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/editor-sdk/LICENSE");
    Deno.copyFileSync(
      "packages/editor-sdk/README.md",
      "npm/editor-sdk/README.md",
    );
  },
}));
