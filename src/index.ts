import { QdrantClient } from "@qdrant/js-client-rest";
import { registerVectorBackend, registerDocStoreBackend } from "@orchid-ai/orchid/rag";
import { QdrantRepository } from "./repository.js";
import { QdrantDocStore } from "./docStore.js";

export { QdrantRepository, buildQdrantFilter } from "./repository.js";
export { QdrantDocStore } from "./docStore.js";

export function register(): void {
    registerVectorBackend("qdrant", (opts: Record<string, unknown>) => {
        const url = (opts["qdrantUrl"] as string) || (opts["qdrant_url"] as string) || "http://localhost:6333";
        const apiKey = (opts["qdrantApiKey"] as string) || (opts["qdrant_api_key"] as string) || undefined;
        const embeddingModel = (opts["embeddingModel"] as string) || (opts["embedding_model"] as string) || undefined;
        return new QdrantRepository(url, { apiKey, embeddingModel });
    });
    registerDocStoreBackend("qdrant", (opts: Record<string, unknown>) => {
        const url = (opts["qdrantUrl"] as string) || (opts["qdrant_url"] as string) || "http://localhost:6333";
        const apiKey = (opts["qdrantApiKey"] as string) || (opts["qdrant_api_key"] as string) || undefined;
        return new QdrantDocStore(new QdrantClient({ url, apiKey }));
    });
}

register();
