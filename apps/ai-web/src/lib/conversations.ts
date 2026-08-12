import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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

export type StoredConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
	messageCount: number;
};

export type ConversationDetail = {
	id: string;
	title: string;
	updatedAt: number;
	messages: StoredMessage[];
};

type UserStore = {
  conversations: StoredConversation[];
};

const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_STORE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TITLE = "新对话";

function dataDir(): string {
  return process.env.AI_WEB_DATA_DIR?.trim() || "/data";
}

function storePath(userId: number): string {
  return path.join(dataDir(), "conversations", `${userId}.json`);
}

async function readStore(userId: number): Promise<UserStore> {
  try {
    const raw = await readFile(storePath(userId), "utf8");
    const parsed = JSON.parse(raw) as UserStore;
    if (!Array.isArray(parsed.conversations)) {
      throw new Error("conversation store is invalid");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { conversations: [] };
    }
    throw error;
  }
}

async function writeStore(userId: number, store: UserStore): Promise<void> {
  const target = storePath(userId);
  const dir = path.dirname(target);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const raw = JSON.stringify(store);
  if (Buffer.byteLength(raw, "utf8") > MAX_STORE_BYTES) {
    throw new Error("conversation store is too large");
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, raw, { mode: 0o600, encoding: "utf8" });
  await rename(temporary, target);
}

function summarize(conversation: StoredConversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
  };
}

export async function listConversations(userId: number): Promise<ConversationSummary[]> {
  const store = await readStore(userId);
  return store.conversations
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 50)
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

export async function createConversation(userId: number): Promise<ConversationSummary> {
  const store = await readStore(userId);
  const now = Date.now();
  const conversation: StoredConversation = {
    id: randomUUID(),
    title: DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  store.conversations.push(conversation);
  await writeStore(userId, store);
  return summarize(conversation);
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
