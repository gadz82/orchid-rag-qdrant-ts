// Qdrant document store — implements OrchidDocStore
import { QdrantClient } from '@qdrant/js-client-rest';
import type { OrchidDocument } from '@orchid-ai/orchid/core';

export class QdrantDocStore {
  constructor(
    private client: QdrantClient,
    private collectionName = 'documents',
  ) {}

  async put(doc: OrchidDocument): Promise<void> {
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [
        {
          id: doc.id || `doc_${Date.now()}`,
          vector: (doc.metadata?.['_embedding'] as number[]) || [],
          payload: {
            page_content: doc.pageContent,
            ...doc.metadata,
          },
        },
      ],
    });
  }

  async get(docId: string): Promise<OrchidDocument | null> {
    try {
      const result = await this.client.retrieve(this.collectionName, {
        ids: [docId],
        with_payload: true,
      });
      if (result.length === 0) return null;
      const r = result[0]!;
      const payload = (r.payload as Record<string, unknown>) || {};
      return {
        id: String(r.id),
        pageContent: (payload['page_content'] as string) || '',
        metadata: payload as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  async getMany(docIds: string[]): Promise<OrchidDocument[]> {
    const results: OrchidDocument[] = [];
    for (const id of docIds) {
      const doc = await this.get(id);
      if (doc) results.push(doc);
    }
    return results;
  }
}
