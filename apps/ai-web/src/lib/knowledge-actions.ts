// 知识库 actions：用户资料与角色资料的读取、添加和删除。

import type { PersonaKnowledge } from "@/lib/types";
import { actionRequest, ActionError, isRecord, type JsonRecord } from "@/lib/action-http";

function parseKnowledgeSummary(body: JsonRecord): PersonaKnowledge {
  const knowledgeBase = body.knowledgeBase;
  return {
    knowledgeBase:
      isRecord(knowledgeBase) &&
      typeof knowledgeBase.id === "string" &&
      typeof knowledgeBase.name === "string"
        ? {
            id: knowledgeBase.id,
            name: knowledgeBase.name,
            embeddingModel:
              typeof knowledgeBase.embeddingModel === "string" ? knowledgeBase.embeddingModel : undefined,
          }
        : null,
    documents: Array.isArray(body.documents) ? body.documents : [],
    chunkCount: typeof body.chunkCount === "number" ? body.chunkCount : 0,
  };
}

export async function getUserKnowledge(fetcher: typeof fetch = fetch): Promise<PersonaKnowledge> {
  const body = await actionRequest<JsonRecord>("/api/me/knowledge", {}, fetcher);
  return parseKnowledgeSummary(body);
}

export async function addUserKnowledgeText(
  name: string,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await actionRequest<JsonRecord>(
    "/api/me/knowledge",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text, source: "paste" }),
    },
    fetcher,
  );
}

export async function addUserKnowledgeFile(
  file: File,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await actionRequest<JsonRecord>("/api/me/knowledge", { method: "POST", body: form }, fetcher);
}

export async function deleteUserKnowledgeDocument(
  documentId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await actionRequest<JsonRecord>(
    `/api/me/knowledge/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
    fetcher,
  );
}

export async function deleteAllUserKnowledge(fetcher: typeof fetch = fetch): Promise<void> {
  await actionRequest<JsonRecord>("/api/me/knowledge", { method: "DELETE" }, fetcher);
}

export async function getPersonaKnowledge(
  personaId: string,
  fetcher: typeof fetch = fetch,
): Promise<PersonaKnowledge> {
  const body = await actionRequest<JsonRecord>(
    `/api/personas/${encodeURIComponent(personaId)}/knowledge`,
    {},
    fetcher,
  );
  return parseKnowledgeSummary(body);
}

export async function addPersonaKnowledgeText(
  personaId: string,
  name: string,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await actionRequest<JsonRecord>(
    `/api/personas/${encodeURIComponent(personaId)}/knowledge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text, source: "paste" }),
    },
    fetcher,
  );
}

export async function addPersonaKnowledgeFile(
  personaId: string,
  file: File,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await actionRequest<JsonRecord>(
    `/api/personas/${encodeURIComponent(personaId)}/knowledge`,
    { method: "POST", body: form },
    fetcher,
  );
}

export async function deletePersonaKnowledgeDocument(
  personaId: string,
  documentId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await actionRequest<JsonRecord>(
    `/api/personas/${encodeURIComponent(personaId)}/knowledge/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
    fetcher,
  );
}

export async function deletePersonaKnowledge(
  personaId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await actionRequest<JsonRecord>(
    `/api/personas/${encodeURIComponent(personaId)}/knowledge`,
    { method: "DELETE" },
    fetcher,
  );
}
