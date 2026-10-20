# orthotypography-integrations

Integrations of
[`@orthotypography/core`](https://github.com/orthotypography/orthotypography)
for tools across the JavaScript ecosystem.

## Packages

| Package                       | Status          | Purpose                                      |
| ----------------------------- | --------------- | -------------------------------------------- |
| `@orthotypography/rehype`     | `0.2.0-alpha.0` | adapts the core to Unified and rehype        |
| `@orthotypography/satteri`    | `0.2.0-alpha.0` | adapts the core to native Sätteri HAST hooks |
| `@orthotypography/astro`      | `0.2.0-alpha.0` | preserves and extends either Astro processor |
| `@orthotypography/editor-sdk` | `0.2.0-alpha.0` | prepares guarded native editor transactions  |

The repository is organized as a workspace. Deno provides the development
tooling; the published packages target the JavaScript ecosystem in general.

## Development

```sh
deno task check
deno task test
deno task npm:check
```

The three content adapters `0.2.0-alpha.0` and the independently versioned
editor SDK `0.2.0-alpha.0` are published on JSR and npm and depend on
`@orthotypography/core@0.2.0-alpha.0`. `deno task core:status` reports each
lane's core dependency. Publication remains gated by the repository variable
`PUBLISH_ENABLED`, and a lane pinned to a development core cannot be published.

## Document editor SDK

[`packages/editor-sdk`](packages/editor-sdk/README.md) prepares immutable
document correction plans and validates revisions and source context before
native editor transactions. It contains no editor-specific API.

```sh
deno task editor:check
deno task editor:test
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the development setup, the Deno
tasks, and the checks expected for each kind of change.

## License

[MIT](./LICENSE) License. Contributions are accepted under the same license; see
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

Copyright (c) 2026 Antoine Boquet.
