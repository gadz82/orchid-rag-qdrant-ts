# @orchid-ai/orchid-rag-qdrant

Qdrant vector and doc-store backend for the [Orchid](https://github.com/gadz82/orchid) multi-agent AI framework — TypeScript port of `orchid-rag-qdrant`.

## Installation

```bash
npm install @orchid-ai/orchid-rag-qdrant
```

## Usage

No code changes are required. Once installed, the package auto-registers `qdrant` in Orchid's vector and doc-store backend registries via package.json entry point.

```yaml
# orchid.yml
vector_backend: qdrant
qdrant_url: http://qdrant:6333
```

Or programmatically:

```ts
import { buildReader } from "@orchid-ai/orchid/rag";

const reader = buildReader({
  vectorBackend: "qdrant",
  qdrantUrl: "http://localhost:6333",
});
```

## Requirements

- Node.js 18+
- A running Qdrant instance (or use the embedded Qdrant client for testing)

## Auto-registration

The package registers itself via the `orchid` key in `package.json`:

```json
{
  "orchid": {
    "vectorBackends": "./dist/index.js",
    "docStoreBackends": "./dist/index.js"
  }
}
```

No manual `registerVectorBackend()` calls are needed by integrators.

## Development

```bash
cd orchid-rag-qdrant-ts
npm install
npm test
npm run lint
npm run typecheck
```

Tests mock `@qdrant/js-client-rest` — no live Qdrant required.

## License

MIT
