import {
  clearPersonaMemory,
  getPersonaMemory,
  listPersonaMemories,
  savePersonaMemory,
} from "@/lib/memory-library";
import type { MemoryRepository } from "@/lib/memory-repository";

export function createFileMemoryRepository(): MemoryRepository {
  return {
    get: (userId, personaId) => getPersonaMemory(userId, personaId),
    save: (userId, memory) => savePersonaMemory(userId, memory),
    clear: (userId, personaId) => clearPersonaMemory(userId, personaId),
    list: (userId) => listPersonaMemories(userId),
  };
}
