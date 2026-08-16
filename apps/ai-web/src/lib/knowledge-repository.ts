// 知识仓储端口：权威资料、切片与派生向量索引的边界。

import type {
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeEmbedder,
  KnowledgeHit,
  KnowledgeSummary,
} from "@/lib/knowledge-library";

export type KnowledgeRepository = {
  getSummary(userId: number, personaId?: string): Promise<KnowledgeSummary>;
  addText(
    userId: number,
    personaId: string | null,
    input: KnowledgeDocumentInput,
    model: string,
    embedder: KnowledgeEmbedder,
  ): Promise<KnowledgeDocument>;
  deleteDocument(userId: number, documentId: string): Promise<void>;
  deleteScope(userId: number, personaId?: string): Promise<void>;
  search(
    userId: number,
    personaId: string | null,
    vector: number[],
    topK: number,
    threshold: number,
  ): Promise<KnowledgeHit[]>;
  listDocumentChunks(
    userId: number,
    documentId: string,
  ): Promise<{ id: string; index: number; text: string; tokens: number }[]>;
};
