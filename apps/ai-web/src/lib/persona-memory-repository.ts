import { buildPersona, isValidPersonaInput, type Persona } from "@/lib/personas";
import type { PersonaRepository } from "@/lib/persona-repository";

const stores = new Map<number, Persona[]>();

function storeFor(userId: number): Persona[] {
  if (!stores.has(userId)) stores.set(userId, []);
  return stores.get(userId)!;
}

export function createMemoryPersonaRepository(): PersonaRepository {
  return {
    async list(userId) {
      return storeFor(userId).slice();
    },
    async create(userId, input) {
      if (!isValidPersonaInput(input)) throw new Error("persona input is invalid");
      if (storeFor(userId).length >= 100) throw new Error("persona limit reached");
      const persona = buildPersona(`custom-${crypto.randomUUID()}`, input);
      storeFor(userId).push(persona);
      return persona;
    },
    async update(userId, personaId, input) {
      if (!isValidPersonaInput(input)) throw new Error("persona input is invalid");
      const store = storeFor(userId);
      const index = store.findIndex((persona) => persona.id === personaId);
      if (index < 0) throw new Error("persona not found");
      const persona = buildPersona(personaId, input);
      store[index] = persona;
      return persona;
    },
    async delete(userId, personaId) {
      const store = storeFor(userId);
      const next = store.filter((persona) => persona.id !== personaId);
      if (next.length === store.length) throw new Error("persona not found");
      stores.set(userId, next);
    },
  };
}
