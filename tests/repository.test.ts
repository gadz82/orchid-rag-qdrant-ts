import { describe, it, expect } from 'vitest';
import { QdrantRepository, buildQdrantFilter } from '../src/repository.js';
import { QdrantDocStore } from '../src/docStore.js';

describe('buildQdrantFilter', () => {
  it('returns empty filter with no scope or filters', () => {
    expect(buildQdrantFilter()).toEqual({});
  });

  it('builds filter with tenant scope', () => {
    const result = buildQdrantFilter({ tenantId: 't1', userId: '', chatId: '', agentId: '', _level: 0 });
    expect(result).toHaveProperty('must');
    const must = result['must'] as Array<Record<string, unknown>>;
    expect(must.some((m) => m['key'] === 'tenant_id')).toBe(true);
  });

  it('builds filter with all scope levels', () => {
    const result = buildQdrantFilter({ tenantId: 't1', userId: 'u1', chatId: 'c1', agentId: 'a1', _level: 0 });
    const must = result['must'] as Array<Record<string, unknown>>;
    expect(must.length).toBe(4);
  });

  it('builds filter with metadata filters', () => {
    const result = buildQdrantFilter(
      { tenantId: 't1', userId: '', chatId: '', agentId: '', _level: 0 },
      { type: 'document' },
    );
    expect(result['must']).toBeDefined();
  });
});

describe('QdrantRepository', () => {
  it('can be constructed', () => {
    const repo = new QdrantRepository('http://localhost:6333');
    expect(repo).toBeDefined();
    expect(repo.clientInstance).toBeDefined();
  });
});

describe('QdrantDocStore', () => {
  it('can be constructed', () => {
    const repo = new QdrantRepository('http://localhost:6333');
    const store = new QdrantDocStore(repo.clientInstance);
    expect(store).toBeDefined();
  });
});
