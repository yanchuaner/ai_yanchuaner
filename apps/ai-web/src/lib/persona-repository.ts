// 角色仓储端口。

import type { Persona } from "@/lib/personas";

export type PersonaRepository = {
  list(userId: number): Promise<Persona[]>;
  create(userId: number, input: unknown): Promise<Persona>;
  update(userId: number, personaId: string, input: unknown): Promise<Persona>;
  delete(userId: number, personaId: string): Promise<void>;
};
