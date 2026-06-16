// Qdrant repository
import { QdrantClient } from '@qdrant/js-client-rest';
import type { OrchidDocument, OrchidSearchResult, OrchidMetadataFilters, OrchidRAGScope } from '@orchid-ai/orchid/core';

export class QdrantRepository {
  private client: QdrantClient;

  constructor(url: string, apiKey?: string) {
    this.client = new QdrantClient({ url, apiKey });
  }

  get clientInstance(): QdrantClient {
    return this.client;
  }

  async ensureCollections(namespaces: string[]): Promise<void> {
    for (const ns of namespaces) {
      const exists = await this.client.collectionExists(ns);
      if (!exists) {
        await this.client.createCollection(ns, { vectors: { size: 768, distance: 'Cosine' } });
      }
    }
  }

  async index(documents: OrchidDocument[], namespace: string): Promise<void> {
    await this.ensureCollections([namespace]);
    const points = documents.map((doc, i) => ({
      id: doc.id || `${namespace}_${i}_${Date.now()}`,
      vector: (doc.metadata['_embedding'] as number[]) || [],
      payload: { page_content: doc.pageContent, ...doc.metadata },
    }));
    if (points.length > 0) {
      await this.client.upsert(namespace, {
        wait: true,
        points: points as Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }>,
      });
    }
  }

  async upsert(documents: OrchidDocument[], namespace: string): Promise<void> {
    await this.index(documents, namespace);
  }

  async delete(documentIds: string[], namespace: string): Promise<void> {
    await this.client.delete(namespace, { wait: true, points: documentIds });
  }

  async retrieve(
    _query: string,
    namespace: string,
    k = 4,
    scope?: OrchidRAGScope,
    metadataFilters?: OrchidMetadataFilters,
  ): Promise<OrchidSearchResult[]> {
    const filter = buildQdrantFilter(scope, metadataFilters);
    const results = await this.client.search(namespace, {
      vector: new Array(768).fill(0),
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
): Record<string, unknown> {
  const must: Array<Record<string, unknown>> = [];
  if (scope) {
    if (scope.tenantId) must.push({ key: 'tenant_id', match: { value: scope.tenantId } });
    if (scope.userId) must.push({ key: 'user_id', match: { value: scope.userId } });
    if (scope.chatId) must.push({ key: 'chat_id', match: { value: scope.chatId } });
    if (scope.agentId) must.push({ key: 'agent_id', match: { value: scope.agentId } });
  }
  if (metadataFilters) {
    for (const [key, value] of Object.entries(metadataFilters)) {
      if (typeof value === 'string' || typeof value === 'number') {
        must.push({ key, match: { value } });
      }
    }
  }
  if (must.length === 0) return {};
  return { must };
}
