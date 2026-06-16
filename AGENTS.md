# orchid-rag-qdrant-ts — AI Context

## What This Package Is

**`@orchid-ai/orchid-rag-qdrant`** is the Qdrant vector backend plugin for the Orchid multi-agent AI framework — the
TypeScript port of the Python `orchid-rag-qdrant` package. It provides `QdrantRepository` (OrchidVectorStoreRepository)
and `QdrantDocStore` (OrchidDocStore). It imports `@orchid-ai/orchid` as a workspace dependency.

## Package Structure

```
orchid-rag-qdrant-ts/
  src/
    index.ts
    repository.ts
    docStore.ts
  tests/
  package.json
```

## Architecture Rules

1. **This is a plugin package.** It implements ABCs defined in `@orchid-ai/orchid/core`. It must NOT contain agent
   logic, graph building, or API endpoints.
2. **Auto-registration via package.json `orchid` key.**
3. **No vendor-specific code in comments.** Use domain-neutral placeholders.
4. **Dependencies:** Only `@orchid-ai/orchid` (workspace) and `@qdrant/js-client-rest`.
5. **Tests mock external services.** No live Qdrant dependency in unit tests. Qdrant service container available for
   optional integration tests in CI.

## Python Reference

This is a 1:1 port of `orchid-rag-qdrant/`. The authoritative reference is:

- `orchid-workspace/orchid-rag-qdrant/` — read source files there

## Key Patterns

### Registration

```ts
// src/index.ts
import { registerVectorBackend, registerDocStoreBackend } from '@orchid-ai/orchid/rag';
import { QdrantRepository } from './repository.js';
import { QdrantDocStore } from './docStore.js';

export { QdrantRepository, QdrantDocStore };

export function register() {
  registerVectorBackend('qdrant', (settings) => new QdrantRepository(settings));
  registerDocStoreBackend('qdrant', (settings) => new QdrantDocStore(settings));
}
```

```json
// package.json
{
  "orchid": {
    "vectorBackends": "./dist/index.js",
    "docStoreBackends": "./dist/index.js"
  }
}
```

## Implements

| ABC                           | Implementation     | Purpose                                 |
|-------------------------------|--------------------|-----------------------------------------|
| `OrchidVectorStoreRepository` | `QdrantRepository` | Vector read/write/admin/scope promotion |
| `OrchidDocStore`              | `QdrantDocStore`   | Parent-document storage                 |

## Testing

```bash
cd orchid-rag-qdrant-ts
npm install
npm test
npm run lint
npm run typecheck
```

## Common Pitfalls

- Embedding dimension mismatch (768 vs 1536 vs 3072) requires wiping and re-indexing.
- Always use `buildQdrantFilter()` for hierarchical scope filtering — never raw payload filters.
- `inferPayloadIndexTypes()` is called at collection creation — handle Qdrant field type inference.
