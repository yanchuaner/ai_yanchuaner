import {
  addKnowledgeDocument,
  addUserKnowledgeDocument,
  deleteKnowledgeDocument,
  deletePersonaKnowledge,
  deleteUserKnowledge,
  getPersonaKnowledgeSummary,
  getUserKnowledgeSummary,
  searchPersonaKnowledge,
  searchUserKnowledge,
  type KnowledgeDocumentInput,
  type KnowledgeEmbedder,
} from "@/lib/knowledge-library";
import type { KnowledgeRepository } from "@/lib/knowledge-repository";

export function createFileKnowledgeRepository(): KnowledgeRepository {
  return {
    getSummary: (userId, personaId) =>
      personaId
        ? getPersonaKnowledgeSummary(userId, personaId)
        : getUserKnowledgeSummary(userId),
    async addText(userId, personaId, input, model, embedder) {
      if (personaId) {
        const added = await addKnowledgeDocument(userId, personaId, "角色", input, model, embedder);
        return added.document;
      }
      const added = await addUserKnowledgeDocument(userId, input, model, embedder);
      return added.document;
    },
    deleteDocument: (userId, documentId) => deleteKnowledgeDocument(userId, documentId),
    deleteScope: (userId, personaId) =>
      personaId ? deletePersonaKnowledge(userId, personaId) : deleteUserKnowledge(userId),
    search: (userId, personaId, vector, topK, threshold) =>
      personaId
        ? searchPersonaKnowledge(userId, personaId, vector, topK, threshold)
        : searchUserKnowledge(userId, vector, topK, threshold),
  };
}
