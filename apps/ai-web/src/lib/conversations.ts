import { randomUUID } from "node:crypto";
import { isValidPersona, type Persona } from "@/lib/personas";
import { readJsonFile, userStorePath, withFileLock, writeJsonFile } from "@/lib/store";

export type StoredUsage = {
  prompt: number;
  completion: number;
};

export type StoredMessage = {
  schemaVersion?: "1.0";
  id: string;
  role: "user" | "assistant";
  content: string;
  personaId?: string;
  imageUrl?: string;
  traceId?: string;
  requestId?: string;
  usage?: StoredUsage;
};

// 会话模式：普通助手、单人角色扮演、多人群聊。
export type ChatMode = "chat" | "roleplay" | "group";

export type StoredConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: ChatMode;
  persona?: Persona;
  cast?: Persona[];
  director?: Persona;
  world?: {
    worldId: string;
    snapshot: {
      title: string;
      description: string;
      timeline: string;
      outline: string;
    };
  };
  userRole?: {
    name: string;
    avatar?: string;
    description: string;
    sourcePersonaId?: string;
  };
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
  personaIds?: string[];
  pinned?: boolean;
  archived?: boolean;
};

export type ConversationDetail = {
  id: string;
  title: string;
  updatedAt: number;
  mode: ChatMode;
  persona?: Persona;
  cast?: Persona[];
  director?: Persona;
  world?: StoredConversation["world"];
  userRole?: StoredConversation["userRole"];
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
  if (candidate.schemaVersion !== undefined && candidate.schemaVersion !== "1.0") return false;
  if (typeof candidate.content !== "string" || candidate.content.length === 0 || candidate.content.length > 16_000) {
    return false;
  }
  if (
    candidate.personaId !== undefined &&
    (typeof candidate.personaId !== "string" || candidate.personaId.length === 0 || candidate.personaId.length > 64)
  ) {
    return false;
  }
  if (candidate.imageUrl !== undefined && typeof candidate.imageUrl !== "string") return false;
  if (candidate.traceId !== undefined && (typeof candidate.traceId !== "string" || candidate.traceId.length > 128)) {
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

function isValidWorldSnapshot(value: unknown): value is StoredConversation["world"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.worldId !== "string" || candidate.worldId.length > 64) return false;
  const snapshot = candidate.snapshot as Record<string, unknown> | undefined;
  return (
    !!snapshot &&
    typeof snapshot.title === "string" &&
    snapshot.title.length <= 60 &&
    typeof snapshot.description === "string" &&
    snapshot.description.length <= 6000 &&
    typeof snapshot.timeline === "string" &&
    snapshot.timeline.length <= 4000 &&
    typeof snapshot.outline === "string" &&
    snapshot.outline.length <= 12000
  );
}

function isValidUserRole(value: unknown): value is StoredConversation["userRole"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0 || candidate.name.length > 32) {
    return false;
  }
  if (typeof candidate.description !== "string" || candidate.description.length > 2000) {
    return false;
  }
  if (candidate.avatar !== undefined && (typeof candidate.avatar !== "string" || candidate.avatar.length > 32)) {
    return false;
  }
  if (
    candidate.sourcePersonaId !== undefined &&
    (typeof candidate.sourcePersonaId !== "string" || candidate.sourcePersonaId.length > 64)
  ) {
    return false;
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
    mode:
      candidate.mode === "roleplay"
        ? "roleplay"
        : candidate.mode === "group" && Array.isArray(candidate.cast) && candidate.cast.filter(isValidPersona).length >= 2
          ? "group"
          : "chat",
    persona:
      candidate.mode === "roleplay" && isValidPersona(candidate.persona) ? candidate.persona : undefined,
    cast:
      candidate.mode === "group" && Array.isArray(candidate.cast)
        ? candidate.cast.filter(isValidPersona).slice(0, 4)
        : undefined,
    director:
      candidate.mode === "group" && isValidPersona(candidate.director) ? candidate.director : undefined,
    world: isValidWorldSnapshot(candidate.world) ? candidate.world : undefined,
    userRole:
      candidate.mode === "group" && isValidUserRole(candidate.userRole) ? candidate.userRole : undefined,
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
    personaIds:
      conversation.mode === "roleplay"
        ? conversation.persona
          ? [conversation.persona.id]
          : undefined
        : conversation.cast?.map((persona) => persona.id),
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
    cast: conversation.cast,
    director: conversation.director,
    world: conversation.world,
    userRole: conversation.userRole,
    pinned: conversation.pinned,
    archived: conversation.archived,
    messages: conversation.messages.slice(),
  };
}

export async function deleteConversation(userId: number, conversationId: string): Promise<void> {
  await withFileLock(storePath(userId), async () => {
    const store = await readStore(userId);
    const next = store.conversations.filter((item) => item.id !== conversationId);
    if (next.length === store.conversations.length) throw new Error("conversation not found");
    store.conversations = next;
    await writeStore(userId, store);
  });
}

export type CreateConversationOptions = {
  mode?: ChatMode;
  persona?: Persona;
  cast?: Persona[];
  director?: Persona;
  world?: StoredConversation["world"];
  userRole?: StoredConversation["userRole"];
};

export async function createConversation(
  userId: number,
  options: CreateConversationOptions = {},
): Promise<ConversationSummary> {
  return withFileLock(storePath(userId), async () => {
    const mode = options.mode === "roleplay" ? "roleplay" : options.mode === "group" ? "group" : "chat";
    let cast: Persona[] | undefined;
    let director: Persona | undefined;
    let world: StoredConversation["world"] | undefined;
    let userRole: StoredConversation["userRole"] | undefined;
    if (mode === "roleplay" && (!options.persona || !isValidPersona(options.persona))) {
      throw new Error("persona is invalid");
    }
    if (mode === "group") {
      cast = Array.isArray(options.cast) ? options.cast.filter(isValidPersona) : [];
      if (cast.length < 2 || cast.length > 4 || new Set(cast.map((persona) => persona.id)).size !== cast.length) {
        throw new Error("cast is invalid");
      }
      if (options.director !== undefined && !isValidPersona(options.director)) {
        throw new Error("director is invalid");
      }
      director = options.director;
    }
    if (options.world !== undefined && !isValidWorldSnapshot(options.world)) {
      throw new Error("world is invalid");
    }
    if (options.userRole !== undefined && !isValidUserRole(options.userRole)) {
      throw new Error("userRole is invalid");
    }
    world = options.world;
    userRole = options.userRole;
    const store = await readStore(userId);
    const now = Date.now();
    const title =
      mode === "group"
        ? cast!.map((persona) => persona.name).join(" × ")
        : mode === "roleplay"
          ? options.persona?.name ?? DEFAULT_TITLE
          : DEFAULT_TITLE;
    const conversation: StoredConversation = {
      id: randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      mode,
      persona: mode === "roleplay" ? options.persona : undefined,
      cast: mode === "group" ? cast! : undefined,
      director: mode === "group" ? director : undefined,
      world,
      userRole: mode === "group" ? userRole : undefined,
      messages: [],
    };
    store.conversations.push(conversation);
    await writeStore(userId, store);
    return summarize(conversation);
  });
}

export async function appendMessage(
  userId: number,
  conversationId: string,
  message: StoredMessage,
): Promise<ConversationSummary> {
  const storedMessage: StoredMessage = { schemaVersion: "1.0", ...message };
  if (!isValidStoredMessage(storedMessage)) throw new Error("message is invalid");
  return withFileLock(storePath(userId), async () => {
    const store = await readStore(userId);
    const conversation = store.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error("conversation not found");
    conversation.messages.push(storedMessage);
    if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      conversation.messages.splice(0, conversation.messages.length - MAX_MESSAGES_PER_CONVERSATION);
    }
    if (storedMessage.role === "user" && conversation.title === DEFAULT_TITLE) {
      conversation.title = storedMessage.content.replace(/\s+/g, " ").trim().slice(0, 30);
    }
    conversation.updatedAt = Date.now();
    await writeStore(userId, store);
    return summarize(conversation);
  });
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
  return withFileLock(storePath(userId), async () => {
    const store = await readStore(userId);
    const conversation = store.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error("conversation not found");
    if (patch.title !== undefined) conversation.title = patch.title.trim();
    if (patch.pinned !== undefined) conversation.pinned = patch.pinned;
    if (patch.archived !== undefined) conversation.archived = patch.archived;
    conversation.updatedAt = Date.now();
    await writeStore(userId, store);
    return summarize(conversation);
  });
}
