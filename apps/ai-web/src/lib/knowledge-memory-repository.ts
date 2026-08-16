import { chunkText } from "@/lib/chunker";
import type {
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeEmbedder,
  KnowledgeHit,
  KnowledgeSummary,
} from "@/lib/knowledge-library";
import type { KnowledgeRepository } from "@/lib/knowledge-repository";

type Store = { bases: KnowledgeBase[]; documents: KnowledgeDocument[]; chunks: KnowledgeChunk[] };

const stores = new Map<number, Store>();

function storeFor(userId: number): Store {
  if (!stores.has(userId)) stores.set(userId, { bases: [], documents: [], chunks: [] });
  return stores.get(userId)!;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += a[i] * b[i];
  return sum;
}

export function createMemoryKnowledgeRepository(): KnowledgeRepository {
  return {
    async getSummary(userId, personaId) {
      const store = storeFor(userId);
      const base = personaId
        ? store.bases.find((item) => item.personaId === personaId)
        : store.bases.find((item) => item.scope === "user");
      if (!base) return { knowledgeBase: null, documents: [], chunkCount: 0 };
      const documents = store.documents.filter((document) => document.kbId === base.id);
      return {
        knowledgeBase: base,
        documents,
        chunkCount: store.chunks.filter((chunk) => chunk.kbId === base.id).length,
      };
    },
    async addText(userId, personaId, input, model, embedder) {
      const store = storeFor(userId);
      let base = personaId
        ? store.bases.find((item) => item.personaId === personaId)
        : store.bases.find((item) => item.scope === "user");
      if (!base) {
        base = {
          id: crypto.randomUUID(),
          scope: personaId ? "persona" : "user",
          ...(personaId ? { personaId } : {}),
          name: personaId ? "角色资料" : "我的资料",
          embeddingModel: model,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        store.bases.push(base);
      }
      const now = Date.now();
      const document: KnowledgeDocument = {
        id: crypto.randomUUID(),
        kbId: base.id,
        name: input.name,
        source: input.source ?? "paste",
        status: "ready",
        createdAt: now,
        updatedAt: now,
        chunkCount: 0,
        tokenCount: 0,
      };
      const texts = chunkText(input.text);
      const vectors = await embedder(texts, model);
      const chunks: KnowledgeChunk[] = texts.map((text, index) => ({
        id: crypto.randomUUID(),
        kbId: base.id,
        documentId: document.id,
        index,
        text,
        tokens: Math.ceil(text.length / 1.5),
        embedding: vectors[index] ?? [],
      }));
      document.chunkCount = chunks.length;
      document.tokenCount = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
      store.documents.push(document);
      store.chunks.push(...chunks);
      return document;
    },
    async deleteDocument(userId, documentId) {
      const store = storeFor(userId);
      if (!store.documents.some((document) => document.id === documentId)) {
        throw new Error("document not found");
      }
      store.documents = store.documents.filter((document) => document.id !== documentId);
      store.chunks = store.chunks.filter((chunk) => chunk.documentId !== documentId);
    },
    async deleteScope(userId, personaId) {
      const store = storeFor(userId);
      const base = personaId
        ? store.bases.find((item) => item.personaId === personaId)
        : store.bases.find((item) => item.scope === "user");
      if (!base) return;
      const kbId = base.id;
      store.bases = store.bases.filter((item) => item.id !== kbId);
      store.documents = store.documents.filter((document) => document.kbId !== kbId);
      store.chunks = store.chunks.filter((chunk) => chunk.kbId !== kbId);
    },
    async search(userId, personaId, vector, topK, threshold) {
      const store = storeFor(userId);
      const base = personaId
        ? store.bases.find((item) => item.personaId === personaId)
        : store.bases.find((item) => item.scope === "user");
      if (!base) return [];
      const documents = new Map(store.documents.map((document) => [document.id, document]));
      return store.chunks
        .filter((chunk) => chunk.kbId === base.id)
        .map((chunk) => ({ chunk, score: dot(vector, chunk.embedding) }))
        .filter((item) => item.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ chunk, score }) => ({
          documentId: chunk.documentId,
          documentName: documents.get(chunk.documentId)?.name ?? "未知资料",
          text: chunk.text,
          score,
        }));
    },
    async listDocumentChunks(userId, documentId) {
      return storeFor(userId)
        .chunks.filter((chunk) => chunk.documentId === documentId)
        .map((chunk) => ({ id: chunk.id, index: chunk.index, text: chunk.text, tokens: chunk.tokens }));
    },
  };
}
