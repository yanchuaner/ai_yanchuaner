// 角色长期记忆：对话沉淀的摘要按角色保存，后续同角色会话自动带上。

import { readJsonFile, userStorePath, withFileLock, writeJsonFile } from "@/lib/store";

export type PersonaMemory = {
  personaId: string;
  summary: string;
  sourceConversationId: string;
  messageCount: number;
  updatedAt: number;
};

type MemoryStore = {
  personaSummaries: PersonaMemory[];
};

const MAX_STORE_BYTES = 1024 * 1024;
const MAX_SUMMARIES = 100;
const MAX_SUMMARY_LENGTH = 4000;

function storePath(userId: number): string {
  return userStorePath("memories", userId);
}

function isValidStore(value: unknown): value is MemoryStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Array.isArray((value as Record<string, unknown>).personaSummaries);
}

async function readStore(userId: number): Promise<MemoryStore> {
  const store = await readJsonFile<MemoryStore>(storePath(userId), { personaSummaries: [] }, isValidStore);
  return {
    personaSummaries: store.personaSummaries.filter(
      (memory): memory is PersonaMemory =>
        typeof memory?.personaId === "string" &&
        typeof memory.summary === "string" &&
        memory.summary.length > 0 &&
        memory.summary.length <= MAX_SUMMARY_LENGTH,
    ),
  };
}

export async function getPersonaMemory(userId: number, personaId: string): Promise<PersonaMemory | null> {
  const store = await readStore(userId);
  return store.personaSummaries.find((memory) => memory.personaId === personaId) ?? null;
}

export async function savePersonaMemory(
  userId: number,
  memory: Omit<PersonaMemory, "updatedAt">,
): Promise<PersonaMemory> {
  const summary = memory.summary.trim();
  if (!summary || summary.length > MAX_SUMMARY_LENGTH) throw new Error("summary is invalid");
  return withFileLock(storePath(userId), async () => {
    const store = await readStore(userId);
    const saved: PersonaMemory = { ...memory, summary, updatedAt: Date.now() };
    const existing = store.personaSummaries.findIndex((item) => item.personaId === memory.personaId);
    if (existing >= 0) store.personaSummaries[existing] = saved;
    else {
      if (store.personaSummaries.length >= MAX_SUMMARIES) {
        store.personaSummaries.shift();
      }
      store.personaSummaries.push(saved);
    }
    await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
    return saved;
  });
}

export async function clearPersonaMemory(userId: number, personaId: string): Promise<void> {
  await withFileLock(storePath(userId), async () => {
    const store = await readStore(userId);
    store.personaSummaries = store.personaSummaries.filter((memory) => memory.personaId !== personaId);
    await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
  });
}

export async function listPersonaMemories(userId: number): Promise<PersonaMemory[]> {
  const store = await readStore(userId);
  return store.personaSummaries.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}
