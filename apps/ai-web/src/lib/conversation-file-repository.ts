// 会话仓储的文件适配器：当前 JSON 存储的封装，后续可替换为数据库适配器。

import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversationDetail,
  listConversations,
  updateConversation,
} from "@/lib/conversations";
import type { ConversationRepository } from "@/lib/conversation-repository";

export function createFileConversationRepository(): ConversationRepository {
  return {
    list: (userId) => listConversations(userId),
    getDetail: (userId, conversationId) => getConversationDetail(userId, conversationId),
    create: (userId, options) => createConversation(userId, options),
    appendMessage: (userId, conversationId, message) => appendMessage(userId, conversationId, message),
    update: (userId, conversationId, patch) => updateConversation(userId, conversationId, patch),
    delete: (userId, conversationId) => deleteConversation(userId, conversationId),
  };
}
