import type { PersonaMemory } from "@/lib/memory-library";
import type { MemoryRepository } from "@/lib/memory-repository";

const stores = new Map<number, PersonaMemory[]>();

function storeFor(userId: number): PersonaMemory[] {
  if (!stores.has(userId)) stores.set(userId, []);
  return stores.get(userId)!;
}

export function createMemoryMemoryRepository(): MemoryRepository {
  return {
    async get(userId, personaId) {
      return storeFor(userId).find((memory) => memory.personaId === personaId) ?? null;
    },
    async save(userId, memory) {
      if (!memory.summary.trim()) throw new Error("summary is invalid");
      const saved: PersonaMemory = { ...memory, summary: memory.summary.trim(), updatedAt: Date.now() };
      const store = storeFor(userId);
      const index = store.findIndex((item) => item.personaId === memory.personaId);
      if (index >= 0) store[index] = saved;
      else store.push(saved);
      return saved;
    },
    async clear(userId, personaId) {
      stores.set(
        userId,
        storeFor(userId).filter((memory) => memory.personaId !== personaId),
      );
    },
    async list(userId) {
      return storeFor(userId).slice();
    },
  };
}
