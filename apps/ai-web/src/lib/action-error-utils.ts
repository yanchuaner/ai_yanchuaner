// 领域 action 错误到页面状态的统一映射。

import { AccountActionError } from "@/lib/account";
import { ActionError } from "@/lib/action-http";
import { ChatActionError } from "@/lib/chat-actions";
import { ConversationActionError } from "@/lib/conversation-actions";

export function isSessionError(error: unknown): boolean {
  return (
    (error instanceof AccountActionError && error.code === "unauthenticated") ||
    (error instanceof ConversationActionError && error.code === "unauthenticated") ||
    (error instanceof ChatActionError && error.code === "unauthenticated") ||
    (error instanceof ActionError && error.code === "unauthenticated")
  );
}

export function resolveActionError(
  error: unknown,
  onUnauthenticated: () => void,
): string | null {
  if (isSessionError(error)) {
    onUnauthenticated();
    return null;
  }
  return error instanceof Error ? error.message : "操作失败。";
}
