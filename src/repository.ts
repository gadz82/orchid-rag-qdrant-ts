// Qdrant repository
import { QdrantClient } from '@qdrant/js-client-rest';
import type { OrchidDocument, OrchidSearchResult, OrchidMetadataFilters, OrchidRAGScope } from '@orchid-ai/orchid/core';
import { OrchidVectorStoreRepository } from '@orchid-ai/orchid/core';
import type { EmbeddingsLike } from '@orchid-ai/orchid/rag';
import { getEmbeddingDimension, buildEmbeddings } from '@orchid-ai/orchid/rag';

export class QdrantRepository extends OrchidVectorStoreRepository {
  private client: QdrantClient;
  private embeddings: EmbeddingsLike | null = null;
  private embeddingsPromise: Promise<void> | null = null;
  private dimension: number;

  constructor(url: string, opts?: { apiKey?: string; embeddings?: EmbeddingsLike | null; embeddingModel?: string }) {
    super();
    this.client = new QdrantClient({ url, apiKey: opts?.apiKey });
    this.embeddings = opts?.embeddings ?? null;
    this.dimension = opts?.embeddingModel ? getEmbeddingDimension(opts.embeddingModel) : 768;

    if (!this.embeddings && opts?.embeddingModel) {
      this.embeddingsPromise = buildEmbeddings(opts.embeddingModel).then((emb) => {
        this.embeddings = emb;
      }).catch((err) => {
        console.error('[QdrantRepository] Failed to build embeddings: %s', err);
      });
    }
  }

  private async ensureEmbeddingsReady(): Promise<void> {
    if (this.embeddingsPromise) {
      await this.embeddingsPromise;
      this.embeddingsPromise = null;
    }
  }

  get clientInstance(): QdrantClient {
    return this.client;
  }

  private async collectionExists(ns: string): Promise<boolean> {
    const result = await this.client.collectionExists(ns);
    if (typeof result === 'boolean') return result;
    if (result && typeof result === 'object' && 'exists' in result) return (result as { exists: boolean }).exists;
    return false;
  }

  async ensureCollections(namespaces: string[]): Promise<void> {
    for (const ns of namespaces) {
      const exists = await this.collectionExists(ns);
      if (!exists) {
        console.info('[QdrantRepository] Creating collection %s with dimension %d', ns, this.dimension);
        try {
          await this.client.createCollection(ns, { vectors: { size: this.dimension, distance: 'Cosine' } });
          console.info('[QdrantRepository] Collection %s created successfully', ns);
        } catch (err) {
          console.error('[QdrantRepository] Failed to create collection %s: %s', ns, err);
          throw err;
        }
      }
    }
  }

  private generatePointId(docId: string | undefined, index: number): number | string {
    if (!docId) {
      return Date.now() + index;
    }
    
    if (/^\d+$/.test(docId)) {
      return parseInt(docId, 10);
    }
    
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docId)) {
      return docId;
    }
    
    let hash = 0;
    for (let i = 0; i < docId.length; i++) {
      const char = docId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash);
  }

  async index(documents: OrchidDocument[], namespace: string): Promise<void> {
    await this.ensureCollections([namespace]);
    await this.ensureEmbeddingsReady();

    const points = [];
    const docsToEmbed: OrchidDocument[] = [];
    const indicesToEmbed: number[] = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]!;
      const existingEmbed = doc.metadata?.['_embedding'] as number[] | undefined;
      if (existingEmbed && existingEmbed.length > 0) {
        points.push({
          id: this.generatePointId(doc.id, i),
          vector: existingEmbed,
          payload: { page_content: doc.pageContent, ...doc.metadata },
        });
      } else {
        docsToEmbed.push(doc);
        indicesToEmbed.push(i);
      }
    }

    if (docsToEmbed.length > 0 && this.embeddings) {
      const texts = docsToEmbed.map(d => d.pageContent);
      const vectors = await this.embeddings.embedDocuments(texts);
      for (let j = 0; j < docsToEmbed.length; j++) {
        const doc = docsToEmbed[j]!;
        const idx = indicesToEmbed[j]!;
        points.push({
          id: this.generatePointId(doc.id, idx),
          vector: vectors[j]!,
          payload: { page_content: doc.pageContent, ...doc.metadata },
        });
      }
    }

    if (points.length > 0) {
      try {
        await this.client.upsert(namespace, {
          wait: true,
          points: points as Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }>,
        });
      } catch (err) {
        console.error('[QdrantRepository] Upsert failed for namespace %s:', namespace);
        console.error('[QdrantRepository] Error:', err instanceof Error ? err.message : String(err));
        console.error('[QdrantRepository] Points count:', points.length);
        console.error('[QdrantRepository] First point:', JSON.stringify(points[0], null, 2));
        throw err;
      }
    }
  }

  async upsert(documents: OrchidDocument[], namespace: string): Promise<void> {
    await this.index(documents, namespace);
  }

  async delete(documentIds: string[], namespace: string): Promise<void> {
    await this.client.delete(namespace, { wait: true, points: documentIds });
  }

  async retrieve(
    query: string,
    namespace: string,
    k = 4,
    scope?: OrchidRAGScope,
    metadataFilters?: OrchidMetadataFilters,
  ): Promise<OrchidSearchResult[]> {
    const exists = await this.collectionExists(namespace);
    if (!exists) {
      return [];
    }

    await this.ensureEmbeddingsReady();

    let queryVector: number[];
    if (this.embeddings) {
      queryVector = await this.embeddings.embedQuery(query);
    } else {
      queryVector = new Array(this.dimension).fill(0);
    }

    const filter = buildQdrantFilter(scope, metadataFilters);
    const results = await this.client.search(namespace, {
      vector: queryVector,
      limit: k,
      filter: filter as unknown as Record<string, unknown>,
      with_payload: true,
    });

    return results.map((r) => {
      const payload = (r.payload as Record<string, unknown>) || {};
      const doc: OrchidDocument = {
        pageContent: (payload['page_content'] as string) || '',
        metadata: payload,
      };
      return { document: doc, score: r.score };
    });
  }

  async promoteScope(_opts: {
    namespace: string;
    sourceFilter: Record<string, unknown>;
    newScopeFields: Record<string, string>;
  }): Promise<number> {
    return 0;
  }
}

export function buildQdrantFilter(
  scope?: OrchidRAGScope,
  metadataFilters?: OrchidMetadataFilters,
  defaultTenant: string = 'default',
): Record<string, unknown> {
  const tenantId = scope?.tenantId || defaultTenant;
  const should: Array<Record<string, unknown>> = [];

  // 1. Root common — tenant_id = "__shared__"
  should.push({
    must: [{ key: 'tenant_id', match: { value: '__shared__' } }],
  });

  // 2. Tenant-level — tenant_id = T AND scope = "tenant"
  should.push({
    must: [
      { key: 'tenant_id', match: { value: tenantId } },
      { key: 'scope', match: { value: 'tenant' } },
    ],
  });

  // 3. User-common — requires user_id
  if (scope?.userId) {
    should.push({
      must: [
        { key: 'tenant_id', match: { value: tenantId } },
        { key: 'user_id', match: { value: scope.userId } },
        { key: 'scope', match: { value: 'user' } },
      ],
    });
  }

  // 4. Chat-shared — requires user_id + chat_id
  if (scope?.userId && scope?.chatId) {
    should.push({
      must: [
        { key: 'tenant_id', match: { value: tenantId } },
        { key: 'user_id', match: { value: scope.userId } },
        { key: 'chat_id', match: { value: scope.chatId } },
        { key: 'scope', match: { value: 'chat_shared' } },
      ],
    });
  }

  // 5. Agent-private — requires user_id + chat_id + agent_id
  if (scope?.userId && scope?.chatId && scope?.agentId) {
    should.push({
      must: [
        { key: 'tenant_id', match: { value: tenantId } },
        { key: 'user_id', match: { value: scope.userId } },
        { key: 'chat_id', match: { value: scope.chatId } },
        { key: 'agent_id', match: { value: scope.agentId } },
        { key: 'scope', match: { value: 'chat_agent' } },
      ],
    });
  }

  // Add metadata filters as must clauses
  const must: Array<Record<string, unknown>> = [];
  if (metadataFilters) {
    for (const [key, value] of Object.entries(metadataFilters)) {
      if (typeof value === 'string' || typeof value === 'number') {
        must.push({ key, match: { value } });
      }
    }
  }

  if (must.length > 0) {
    // When metadata filters are present, wrap scope should clauses inside must
    return {
      must: [{ should }, ...must],
    };
  }

  // Scope should acts as hard OR filter on its own
  return { should };
}
