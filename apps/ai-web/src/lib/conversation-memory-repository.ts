// 会话仓储的内存实现：用于契约测试与隔离环境，不落盘。

import {
  isValidStoredMessage,
  type ChatMode,
  type ConversationSummary,
  type CreateConversationOptions,
  type StoredConversation,
  type StoredMessage,
} from "@/lib/conversations";
import { isValidPersona } from "@/lib/personas";
import type { ConversationRepository } from "@/lib/conversation-repository";

type MemoryStore = { conversations: StoredConversation[] };

const stores = new Map<number, MemoryStore>();

function storeFor(userId: number): MemoryStore {
  let store = stores.get(userId);
  if (!store) {
    store = { conversations: [] };
    stores.set(userId, store);
  }
  return store;
}

function summarize(conversation: StoredConversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    mode: conversation.mode,
    personaName: conversation.persona?.name,
    personaId: conversation.persona?.id,
    personaIds: conversation.cast?.map((persona) => persona.id),
    pinned: conversation.pinned,
    archived: conversation.archived,
  };
}

function find(userId: number, conversationId: string): StoredConversation {
  const conversation = storeFor(userId).conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error("conversation not found");
  return conversation;
}

export function createMemoryConversationRepository(): ConversationRepository {
  return {
    async list(userId) {
      return storeFor(userId)
        .conversations.slice()
        .sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        })
        .map(summarize);
    },
    async getDetail(userId, conversationId) {
      const conversation = find(userId, conversationId);
      return {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        mode: conversation.mode,
        persona: conversation.persona,
        cast: conversation.cast,
        director: conversation.director,
        world: conversation.world,
        userRole: conversation.userRole,
        pinned: conversation.pinned,
        archived: conversation.archived,
        messages: conversation.messages.slice(),
      };
    },
    async create(userId, options = {}) {
      const mode: ChatMode = options.mode === "roleplay" ? "roleplay" : options.mode === "group" ? "group" : "chat";
      if (mode === "roleplay" && (!options.persona || !isValidPersona(options.persona))) {
        throw new Error("persona is invalid");
      }
      if (mode === "group") {
        const cast = Array.isArray(options.cast) ? options.cast.filter(isValidPersona) : [];
        if (cast.length < 2 || cast.length > 4 || new Set(cast.map((persona) => persona.id)).size !== cast.length) {
          throw new Error("cast is invalid");
        }
      }
      const now = Date.now();
      const conversation: StoredConversation = {
        id: crypto.randomUUID(),
        title:
          mode === "group"
            ? (options.cast ?? []).map((persona) => persona.name).join(" × ")
            : mode === "roleplay"
              ? options.persona?.name ?? "新对话"
              : "新对话",
        createdAt: now,
        updatedAt: now,
        mode,
        persona: mode === "roleplay" ? options.persona : undefined,
        cast: mode === "group" ? options.cast : undefined,
        director: mode === "group" ? options.director : undefined,
        world: mode === "group" ? options.world : undefined,
        userRole: mode === "group" ? options.userRole : undefined,
        messages: [],
      };
      storeFor(userId).conversations.push(conversation);
      return summarize(conversation);
    },
    async appendMessage(userId, conversationId, message) {
      if (!isValidStoredMessage(message)) throw new Error("message is invalid");
      const conversation = find(userId, conversationId);
      conversation.messages.push(message);
      if (conversation.title === "新对话" && message.role === "user") {
        conversation.title = message.content.replace(/\s+/g, " ").trim().slice(0, 30);
      }
      conversation.updatedAt = Date.now();
      return summarize(conversation);
    },
    async update(userId, conversationId, patch) {
      if (
        patch.title !== undefined &&
        (typeof patch.title !== "string" || patch.title.trim().length === 0 || patch.title.length > 60)
      ) {
        throw new Error("title is invalid");
      }
      const conversation = find(userId, conversationId);
      if (patch.title !== undefined) conversation.title = patch.title.trim();
      if (patch.pinned !== undefined) conversation.pinned = patch.pinned;
      if (patch.archived !== undefined) conversation.archived = patch.archived;
      conversation.updatedAt = Date.now();
      return summarize(conversation);
    },
    async delete(userId, conversationId) {
      const store = storeFor(userId);
      const next = store.conversations.filter((item) => item.id !== conversationId);
      if (next.length === store.conversations.length) throw new Error("conversation not found");
      store.conversations = next;
    },
  };
}
