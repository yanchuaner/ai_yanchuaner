import { randomUUID } from "node:crypto";
import { isValidPersona, type Persona } from "@/lib/personas";
import { readJsonFile, userStorePath, writeJsonFile } from "@/lib/store";

export type StoredUsage = {
  prompt: number;
  completion: number;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  requestId?: string;
  usage?: StoredUsage;
};

// 会话模式。当前只有普通助手与单人角色扮演；
// 后续多 AI 群聊会新增 group 模式，并在会话上扩展 cast 等字段，不迁移现有数据。
export type ChatMode = "chat" | "roleplay";

export type StoredConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: ChatMode;
  persona?: Persona;
  pinned?: boolean;
  archived?: boolean;
  messages: StoredMessage[];
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  mode: ChatMode;
  personaName?: string;
  personaId?: string;
  pinned?: boolean;
  archived?: boolean;
};

export type ConversationDetail = {
  id: string;
  title: string;
  updatedAt: number;
  mode: ChatMode;
  persona?: Persona;
  pinned?: boolean;
  archived?: boolean;
  messages: StoredMessage[];
};

type UserStore = {
  conversations: StoredConversation[];
};

const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_STORE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TITLE = "新对话";

function storePath(userId: number): string {
  return userStorePath("conversations", userId);
}

export function isValidStoredMessage(message: unknown): message is StoredMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Record<string, unknown>;
  if (candidate.role !== "user" && candidate.role !== "assistant") return false;
  if (typeof candidate.content !== "string" || candidate.content.length === 0 || candidate.content.length > 16_000) {
    return false;
  }
  if (candidate.requestId !== undefined && (typeof candidate.requestId !== "string" || candidate.requestId.length > 128)) {
    return false;
  }
  if (candidate.usage !== undefined) {
    const usage = candidate.usage as Record<string, unknown>;
    if (
      typeof usage.prompt !== "number" ||
      !Number.isInteger(usage.prompt) ||
      usage.prompt < 0 ||
      typeof usage.completion !== "number" ||
      !Number.isInteger(usage.completion) ||
      usage.completion < 0
    ) {
      return false;
    }
  }
  return true;
}

// 读取时兼容旧数据：没有 mode 的会话视为普通助手，无效的角色卡与消息直接丢弃。
function normalizeConversation(raw: unknown): StoredConversation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.createdAt !== "number" ||
    typeof candidate.updatedAt !== "number" ||
    !Array.isArray(candidate.messages)
  ) {
    return null;
  }
  return {
    id: candidate.id,
    title: candidate.title,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    mode: candidate.mode === "roleplay" ? "roleplay" : "chat",
    persona: isValidPersona(candidate.persona) ? candidate.persona : undefined,
    pinned: candidate.pinned === true,
    archived: candidate.archived === true,
    messages: candidate.messages.filter(isValidStoredMessage),
  };
}

function isValidUserStore(value: unknown): value is UserStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Array.isArray((value as Record<string, unknown>).conversations);
}

async function readStore(userId: number): Promise<UserStore> {
  const store = await readJsonFile<UserStore>(storePath(userId), { conversations: [] }, isValidUserStore);
  return {
    conversations: store.conversations
      .map(normalizeConversation)
      .filter((conversation): conversation is StoredConversation => conversation !== null),
  };
}

async function writeStore(userId: number, store: UserStore): Promise<void> {
  await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
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
    pinned: conversation.pinned,
    archived: conversation.archived,
  };
}

export async function listConversations(userId: number): Promise<ConversationSummary[]> {
  const store = await readStore(userId);
  return store.conversations
    .slice()
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, 100)
    .map(summarize);
}

export async function getConversation(userId: number, conversationId: string): Promise<StoredMessage[]> {
  const store = await readStore(userId);
  const conversation = store.conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error("conversation not found");
  return conversation.messages.slice();
}

export async function getConversationDetail(userId: number, conversationId: string): Promise<ConversationDetail> {
  const store = await readStore(userId);
  const conversation = store.conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error("conversation not found");
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    mode: conversation.mode,
    persona: conversation.persona,
    pinned: conversation.pinned,
    archived: conversation.archived,
    messages: conversation.messages.slice(),
  };
}

export async function deleteConversation(userId: number, conversationId: string): Promise<void> {
  const store = await readStore(userId);
  const next = store.conversations.filter((item) => item.id !== conversationId);
  if (next.length === store.conversations.length) throw new Error("conversation not found");
  store.conversations = next;
  await writeStore(userId, store);
}

export type CreateConversationOptions = {
  mode?: ChatMode;
  persona?: Persona;
};

export async function createConversation(
  userId: number,
  options: CreateConversationOptions = {},
): Promise<ConversationSummary> {
  const mode = options.mode === "roleplay" ? "roleplay" : "chat";
  if (mode === "roleplay" && (!options.persona || !isValidPersona(options.persona))) {
    throw new Error("persona is invalid");
  }
  const store = await readStore(userId);
  const now = Date.now();
  const conversation: StoredConversation = {
    id: randomUUID(),
    title: mode === "roleplay" ? options.persona?.name ?? DEFAULT_TITLE : DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    mode,
    persona: mode === "roleplay" ? options.persona : undefined,
    messages: [],
  };
  store.conversations.push(conversation);
  await writeStore(userId, store);
  return summarize(conversation);
}

export async function appendMessage(
  userId: number,
  conversationId: string,
  message: StoredMessage,
): Promise<ConversationSummary> {
  if (!isValidStoredMessage(message)) throw new Error("message is invalid");
  const store = await readStore(userId);
  const conversation = store.conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error("conversation not found");
  conversation.messages.push(message);
  if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conversation.messages.splice(0, conversation.messages.length - MAX_MESSAGES_PER_CONVERSATION);
  }
  if (message.role === "user" && conversation.title === DEFAULT_TITLE) {
    conversation.title = message.content.replace(/\s+/g, " ").trim().slice(0, 30);
  }
  conversation.updatedAt = Date.now();
  await writeStore(userId, store);
  return summarize(conversation);
}

export type ConversationUpdate = {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
};

export async function updateConversation(
  userId: number,
  conversationId: string,
  patch: ConversationUpdate,
): Promise<ConversationSummary> {
  if (
    patch.title !== undefined &&
    (typeof patch.title !== "string" || patch.title.trim().length === 0 || patch.title.length > 60)
  ) {
    throw new Error("title is invalid");
  }
  const store = await readStore(userId);
  const conversation = store.conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error("conversation not found");
  if (patch.title !== undefined) conversation.title = patch.title.trim();
  if (patch.pinned !== undefined) conversation.pinned = patch.pinned;
  if (patch.archived !== undefined) conversation.archived = patch.archived;
  conversation.updatedAt = Date.now();
  await writeStore(userId, store);
  return summarize(conversation);
}
