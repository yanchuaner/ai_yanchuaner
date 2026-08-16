import { createPersona, deletePersona, listPersonas, updatePersona } from "@/lib/persona-library";
import type { PersonaRepository } from "@/lib/persona-repository";

export function createFilePersonaRepository(): PersonaRepository {
  return {
    list: (userId) => listPersonas(userId),
    create: (userId, input) => createPersona(userId, input),
    update: (userId, personaId, input) => updatePersona(userId, personaId, input),
    delete: (userId, personaId) => deletePersona(userId, personaId),
  };
}
