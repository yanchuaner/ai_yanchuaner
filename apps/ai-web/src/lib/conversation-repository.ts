// 会话仓储端口：领域服务只依赖该接口，不直接读写文件或目录布局。

import type {
  ConversationDetail,
  ConversationSummary,
  CreateConversationOptions,
  ConversationUpdate,
  StoredMessage,
} from "@/lib/conversations";

export type ConversationRepository = {
  list(userId: number): Promise<ConversationSummary[]>;
  getDetail(userId: number, conversationId: string): Promise<ConversationDetail>;
  create(userId: number, options?: CreateConversationOptions): Promise<ConversationSummary>;
  appendMessage(userId: number, conversationId: string, message: StoredMessage): Promise<ConversationSummary>;
  update(userId: number, conversationId: string, patch: ConversationUpdate): Promise<ConversationSummary>;
  delete(userId: number, conversationId: string): Promise<void>;
};
