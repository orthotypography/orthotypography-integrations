# orthotypography-integrations

Integrations of
[`@orthotypography/core`](https://github.com/orthotypography/orthotypography)
for tools across the JavaScript ecosystem.

## Packages

| Package                       | Status          | Purpose                                      |
| ----------------------------- | --------------- | -------------------------------------------- |
| `@orthotypography/rehype`     | `0.1.0-alpha.2` | adapts the core to Unified and rehype        |
| `@orthotypography/satteri`    | `0.1.0-alpha.2` | adapts the core to native Sätteri HAST hooks |
| `@orthotypography/astro`      | `0.1.0-alpha.2` | preserves and extends either Astro processor |
| `@orthotypography/editor-sdk` | `0.1.0-alpha.1` | prepares guarded native editor transactions  |

The repository is organized as a workspace. Deno provides the development
tooling; the published packages target the JavaScript ecosystem in general.

## Development

```sh
deno task check
deno task test
deno task npm:check
```

The three content adapters are developed against core commit
[`71d23ea`](https://github.com/orthotypography/orthotypography/commit/71d23eacad1a3722f316e65e3821f7fecad437e7)
of the unreleased `0.2` line; their published `0.1.0-alpha.2` versions use
`@orthotypography/core@0.1.0-alpha.3`. The independently versioned editor SDK
uses core `0.1.0-alpha.3`. `deno task core:status` reports each lane's core
dependency. Publication remains gated by the repository variable
`PUBLISH_ENABLED`, and a lane pinned to a development core cannot be published.

## Document editor SDK

[`packages/editor-sdk`](packages/editor-sdk/README.md) prepares immutable
document correction plans and validates revisions and source context before
native editor transactions. Its Google Docs subpath adds extraction, guarded
review and an authentication-neutral REST transport.

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
