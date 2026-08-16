// 长期记忆仓储端口。

import type { PersonaMemory } from "@/lib/memory-library";

export type MemoryRepository = {
  get(userId: number, personaId: string): Promise<PersonaMemory | null>;
  save(userId: number, memory: Omit<PersonaMemory, "updatedAt">): Promise<PersonaMemory>;
  clear(userId: number, personaId: string): Promise<void>;
  list(userId: number): Promise<PersonaMemory[]>;
};
