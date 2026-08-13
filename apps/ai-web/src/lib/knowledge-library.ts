// 角色资料库：按用户隔离的文档、片段与向量存储。
// 预览阶段向量直接落在数据卷 JSON 中，检索接口保持不变，后续可换 pgvector。

import { randomUUID } from "node:crypto";
import { chunkText } from "@/lib/chunker";
import { readJsonFile, userStorePath, writeJsonFile } from "@/lib/store";
import { searchVectors } from "@/lib/vector-index";

export type KnowledgeBase = {
  id: string;
  scope: "persona" | "user";
  personaId?: string;
  name: string;
  embeddingModel?: string;
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeDocument = {
  id: string;
  kbId: string;
  name: string;
  source: "paste" | "file";
  status: "ready" | "error";
  error?: string;
  createdAt: number;
  updatedAt: number;
  chunkCount: number;
  tokenCount: number;
};

export type KnowledgeChunk = {
  id: string;
  kbId: string;
  documentId: string;
  index: number;
  text: string;
  tokens: number;
  embedding: number[];
};

export type KnowledgeDocumentInput = {
  name: string;
  text: string;
  source?: "paste" | "file";
};

export type KnowledgeSummary = {
  knowledgeBase: KnowledgeBase | null;
  documents: KnowledgeDocument[];
  chunkCount: number;
};

export type KnowledgeHit = {
  documentId: string;
  documentName: string;
  text: string;
  score: number;
};

export type KnowledgeEmbedder = (texts: string[], model: string) => Promise<number[][]>;

type KnowledgeStore = {
  knowledgeBases: KnowledgeBase[];
  documents: KnowledgeDocument[];
  chunks: KnowledgeChunk[];
};

const MAX_STORE_BYTES = 12 * 1024 * 1024;
const MAX_DOCUMENTS_PER_PERSONA = 20;
const MAX_CHARS_PER_DOCUMENT = 200_000;
const MAX_CHUNKS_PER_USER = 600;

function storePath(userId: number): string {
  return userStorePath("knowledge", userId);
}

function isValidStore(value: unknown): value is KnowledgeStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.knowledgeBases) &&
    Array.isArray(candidate.documents) &&
    Array.isArray(candidate.chunks)
  );
}

async function readStore(userId: number): Promise<KnowledgeStore> {
  const store = await readJsonFile<KnowledgeStore>(
    storePath(userId),
    { knowledgeBases: [], documents: [], chunks: [] },
    isValidStore,
  );
  return {
    knowledgeBases: store.knowledgeBases
      .filter((kb) => {
        if (typeof kb?.id !== "string") return false;
        if (kb.scope === "user") return true;
        if (kb.scope === "persona") return typeof kb.personaId === "string";
        // 旧数据没有 scope 字段时按角色资料库兼容。
        return typeof kb.personaId === "string";
      })
      .map((kb) => ({
        ...kb,
        scope: kb.scope === "user" ? ("user" as const) : ("persona" as const),
      })),
    documents: store.documents.filter((doc): doc is KnowledgeDocument => typeof doc?.id === "string"),
    chunks: store.chunks.filter((chunk): chunk is KnowledgeChunk => typeof chunk?.id === "string"),
  };
}

async function writeStore(userId: number, store: KnowledgeStore): Promise<void> {
  await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.5);
}

export async function getPersonaKnowledgeSummary(
  userId: number,
  personaId: string,
): Promise<KnowledgeSummary> {
  const store = await readStore(userId);
  const knowledgeBase = store.knowledgeBases.find((kb) => kb.personaId === personaId) ?? null;
  const documents = knowledgeBase
    ? store.documents.filter((document) => document.kbId === knowledgeBase.id)
    : [];
  const chunkCount = knowledgeBase
    ? store.chunks.filter((chunk) => chunk.kbId === knowledgeBase.id).length
    : 0;
  return { knowledgeBase, documents, chunkCount };
}

async function ensureKnowledgeBase(
  store: KnowledgeStore,
  personaId: string,
  personaName: string,
  embeddingModel?: string,
): Promise<KnowledgeBase> {
  let knowledgeBase = store.knowledgeBases.find((kb) => kb.personaId === personaId);
  if (!knowledgeBase) {
    const now = Date.now();
    knowledgeBase = {
      id: `kb-${randomUUID()}`,
      scope: "persona",
      personaId,
      name: `${personaName}的资料库`,
      embeddingModel,
      createdAt: now,
      updatedAt: now,
    };
    store.knowledgeBases.push(knowledgeBase);
  } else if (embeddingModel && !knowledgeBase.embeddingModel) {
    knowledgeBase.embeddingModel = embeddingModel;
    knowledgeBase.updatedAt = Date.now();
  }
  return knowledgeBase;
}

async function ensureUserKnowledgeBase(
  store: KnowledgeStore,
  embeddingModel?: string,
): Promise<KnowledgeBase> {
  let knowledgeBase = store.knowledgeBases.find((kb) => kb.scope === "user");
  if (!knowledgeBase) {
    const now = Date.now();
    knowledgeBase = {
      id: `kb-${randomUUID()}`,
      scope: "user",
      name: "我的资料",
      embeddingModel,
      createdAt: now,
      updatedAt: now,
    };
    store.knowledgeBases.push(knowledgeBase);
  } else if (embeddingModel && !knowledgeBase.embeddingModel) {
    knowledgeBase.embeddingModel = embeddingModel;
    knowledgeBase.updatedAt = Date.now();
  }
  return knowledgeBase;
}

async function addDocumentToKnowledgeBase(
  store: KnowledgeStore,
  knowledgeBase: KnowledgeBase,
  input: KnowledgeDocumentInput,
  model: string,
  embedder: KnowledgeEmbedder,
): Promise<KnowledgeDocument> {
  const name = input.name.trim().slice(0, 80);
  const text = input.text.trim();
  if (!name) throw new Error("document name is invalid");
  if (!text || text.length > MAX_CHARS_PER_DOCUMENT) {
    throw new Error(text.length > MAX_CHARS_PER_DOCUMENT ? "document is too large" : "document is empty");
  }
  const documentCount = store.documents.filter((document) => document.kbId === knowledgeBase.id).length;
  if (documentCount >= MAX_DOCUMENTS_PER_PERSONA) throw new Error("document limit reached");

  const chunks = chunkText(text);
  const totalChunks = store.chunks.filter((chunk) => chunk.kbId === knowledgeBase.id).length;
  if (totalChunks + chunks.length > MAX_CHUNKS_PER_USER) throw new Error("chunk limit reached");

  let vectors: number[][];
  try {
    vectors = await embedder(chunks, model);
  } catch {
    throw new Error("embedding failed");
  }
  if (vectors.length !== chunks.length) throw new Error("embedding result mismatch");

  const now = Date.now();
  const document: KnowledgeDocument = {
    id: `doc-${randomUUID()}`,
    kbId: knowledgeBase.id,
    name,
    source: input.source ?? "paste",
    status: "ready",
    createdAt: now,
    updatedAt: now,
    chunkCount: chunks.length,
    tokenCount: chunks.reduce((sum, chunk) => sum + estimateTokens(chunk), 0),
  };
  store.documents.push(document);
  chunks.forEach((textChunk, index) => {
    store.chunks.push({
      id: `chunk-${randomUUID()}`,
      kbId: knowledgeBase.id,
      documentId: document.id,
      index,
      text: textChunk,
      tokens: estimateTokens(textChunk),
      embedding: vectors[index],
    });
  });
  knowledgeBase.updatedAt = now;
  return document;
}

export async function addKnowledgeDocument(
  userId: number,
  personaId: string,
  personaName: string,
  input: KnowledgeDocumentInput,
  model: string,
  embedder: KnowledgeEmbedder,
): Promise<{ document: KnowledgeDocument; model: string }> {
  const store = await readStore(userId);
  const knowledgeBase = await ensureKnowledgeBase(store, personaId, personaName, model);
  const document = await addDocumentToKnowledgeBase(store, knowledgeBase, input, model, embedder);
  await writeStore(userId, store);
  return { document, model };
}

export async function getUserKnowledgeSummary(userId: number): Promise<KnowledgeSummary> {
  const store = await readStore(userId);
  const knowledgeBase = store.knowledgeBases.find((kb) => kb.scope === "user") ?? null;
  const documents = knowledgeBase
    ? store.documents.filter((document) => document.kbId === knowledgeBase.id)
    : [];
  const chunkCount = knowledgeBase
    ? store.chunks.filter((chunk) => chunk.kbId === knowledgeBase.id).length
    : 0;
  return { knowledgeBase, documents, chunkCount };
}

export async function addUserKnowledgeDocument(
  userId: number,
  input: KnowledgeDocumentInput,
  model: string,
  embedder: KnowledgeEmbedder,
): Promise<{ document: KnowledgeDocument; model: string }> {
  const store = await readStore(userId);
  const knowledgeBase = await ensureUserKnowledgeBase(store, model);
  const document = await addDocumentToKnowledgeBase(store, knowledgeBase, input, model, embedder);
  await writeStore(userId, store);
  return { document, model };
}

export async function deleteUserKnowledge(userId: number): Promise<void> {
  const store = await readStore(userId);
  const knowledgeBase = store.knowledgeBases.find((kb) => kb.scope === "user");
  if (!knowledgeBase) return;
  const kbId = knowledgeBase.id;
  store.knowledgeBases = store.knowledgeBases.filter((kb) => kb.id !== kbId);
  store.documents = store.documents.filter((document) => document.kbId !== kbId);
  store.chunks = store.chunks.filter((chunk) => chunk.kbId !== kbId);
  await writeStore(userId, store);
}

export async function deleteKnowledgeDocument(userId: number, documentId: string): Promise<void> {
  const store = await readStore(userId);
  const document = store.documents.find((item) => item.id === documentId);
  if (!document) throw new Error("document not found");
  store.documents = store.documents.filter((item) => item.id !== documentId);
  store.chunks = store.chunks.filter((chunk) => chunk.documentId !== documentId);
  await writeStore(userId, store);
}

export async function deletePersonaKnowledge(userId: number, personaId: string): Promise<void> {
  const store = await readStore(userId);
  const knowledgeBase = store.knowledgeBases.find((kb) => kb.personaId === personaId);
  if (!knowledgeBase) return;
  const kbId = knowledgeBase.id;
  store.knowledgeBases = store.knowledgeBases.filter((kb) => kb.id !== kbId);
  store.documents = store.documents.filter((document) => document.kbId !== kbId);
  store.chunks = store.chunks.filter((chunk) => chunk.kbId !== kbId);
  await writeStore(userId, store);
}

export async function searchPersonaKnowledge(
  userId: number,
  personaId: string,
  queryVector: number[],
  topK = 4,
  threshold = 0.3,
): Promise<KnowledgeHit[]> {
  const store = await readStore(userId);
  const knowledgeBase = store.knowledgeBases.find((kb) => kb.personaId === personaId);
  if (!knowledgeBase) return [];
  const chunks = store.chunks.filter((chunk) => chunk.kbId === knowledgeBase.id);
  const matches = searchVectors(
    queryVector,
    chunks.map((chunk) => ({ id: chunk.id, vector: chunk.embedding })),
    topK,
    threshold,
  );
  const documents = new Map(store.documents.map((document) => [document.id, document]));
  return matches
    .map((match) => {
      const chunk = chunks.find((item) => item.id === match.id);
      if (!chunk) return null;
      return {
        documentId: chunk.documentId,
        documentName: documents.get(chunk.documentId)?.name ?? "未知资料",
        text: chunk.text,
        score: match.score,
      };
    })
    .filter((hit): hit is KnowledgeHit => hit !== null);
}

export async function searchUserKnowledge(
  userId: number,
  queryVector: number[],
  topK = 4,
  threshold = 0.3,
): Promise<KnowledgeHit[]> {
  const store = await readStore(userId);
  const knowledgeBase = store.knowledgeBases.find((kb) => kb.scope === "user");
  if (!knowledgeBase) return [];
  const chunks = store.chunks.filter((chunk) => chunk.kbId === knowledgeBase.id);
  const matches = searchVectors(
    queryVector,
    chunks.map((chunk) => ({ id: chunk.id, vector: chunk.embedding })),
    topK,
    threshold,
  );
  const documents = new Map(store.documents.map((document) => [document.id, document]));
  return matches
    .map((match) => {
      const chunk = chunks.find((item) => item.id === match.id);
      if (!chunk) return null;
      return {
        documentId: chunk.documentId,
        documentName: documents.get(chunk.documentId)?.name ?? "未知资料",
        text: chunk.text,
        score: match.score,
      };
    })
    .filter((hit): hit is KnowledgeHit => hit !== null);
}

export async function listDocumentChunks(
  userId: number,
  documentId: string,
): Promise<{ id: string; index: number; text: string; tokens: number }[]> {
  const store = await readStore(userId);
  return store.chunks
    .filter((chunk) => chunk.documentId === documentId)
    .sort((a, b) => a.index - b.index)
    .map(({ id, index, text, tokens }) => ({ id, index, text, tokens }));
}
