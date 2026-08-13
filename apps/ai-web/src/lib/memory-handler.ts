// 会话长期记忆编排：单人角色与群聊统一入口，按角色分别沉淀摘要。

import type { ConversationDetail } from "@/lib/conversations";
import { generateConversationMemory } from "@/lib/memory-generator";
import {
  clearPersonaMemory,
  getPersonaMemory,
  savePersonaMemory,
  type PersonaMemory,
} from "@/lib/memory-library";
import type { Persona } from "@/lib/personas";

export const MIN_MESSAGES = 15;
export const UPDATE_STEP = 15;

export type PersonaMemoryView = {
  personaId: string;
  name: string;
  memory: PersonaMemory | null;
};

function memoryTargets(detail: ConversationDetail): Persona[] {
  if (detail.mode === "roleplay" && detail.persona) return [detail.persona];
  return detail.cast ?? [];
}

export async function listConversationMemories(
  userId: number,
  detail: ConversationDetail,
): Promise<PersonaMemoryView[]> {
  return Promise.all(
    memoryTargets(detail).map(async (persona) => ({
      personaId: persona.id,
      name: persona.name,
      memory: await getPersonaMemory(userId, persona.id),
    })),
  );
}

export async function updateConversationMemories(
  apiBaseUrl: URL,
  accessKey: string,
  model: string,
  userId: number,
  detail: ConversationDetail,
  fetcher: typeof fetch = fetch,
): Promise<{ updated: boolean; memories: PersonaMemoryView[] }> {
  if (detail.messages.length < MIN_MESSAGES) {
    return { updated: false, memories: await listConversationMemories(userId, detail) };
  }
  const targets = memoryTargets(detail);
  if (targets.length === 0) return { updated: false, memories: [] };
  const speakerMap = Object.fromEntries(targets.map((persona) => [persona.id, persona.name]));
  const stale = [];
  for (const persona of targets) {
    const existing = await getPersonaMemory(userId, persona.id);
    if (!existing || detail.messages.length - existing.messageCount >= UPDATE_STEP) {
      stale.push(persona);
    }
  }
  if (stale.length === 0) {
    return { updated: false, memories: await listConversationMemories(userId, detail) };
  }
  const generated = await Promise.all(
    stale.map(async (persona) => {
      const result = await generateConversationMemory(
        apiBaseUrl,
        accessKey,
        model,
        detail.messages,
        fetcher,
        { speakerName: persona.name, speakerMap },
      );
      return { persona, summary: result.summary };
    }),
  );
  for (const item of generated) {
    await savePersonaMemory(userId, {
      personaId: item.persona.id,
      summary: item.summary,
      sourceConversationId: detail.id,
      messageCount: detail.messages.length,
    });
  }
  return { updated: true, memories: await listConversationMemories(userId, detail) };
}

export async function clearConversationMemories(
  userId: number,
  detail: ConversationDetail,
): Promise<void> {
  await Promise.all(
    memoryTargets(detail).map((persona) => clearPersonaMemory(userId, persona.id)),
  );
}
