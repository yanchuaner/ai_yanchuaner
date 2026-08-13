// 个人角色库：保存用户自定义的角色卡，供多个会话复用。
// 会话保存的是角色卡快照，删除角色库条目不会影响已有会话。

import { randomUUID } from "node:crypto";
import { buildPersona, isValidPersona, isValidPersonaInput, type Persona } from "@/lib/personas";
import { readJsonFile, userStorePath, writeJsonFile } from "@/lib/store";

type PersonaStore = {
  personas: Persona[];
};

const MAX_PERSONAS_PER_USER = 100;
const MAX_STORE_BYTES = 2 * 1024 * 1024;

function storePath(userId: number): string {
  return userStorePath("personas", userId);
}

function isValidStore(value: unknown): value is PersonaStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Array.isArray((value as Record<string, unknown>).personas);
}

async function readStore(userId: number): Promise<PersonaStore> {
  const store = await readJsonFile<PersonaStore>(storePath(userId), { personas: [] }, isValidStore);
  return { personas: store.personas.filter(isValidPersona) };
}

export async function listPersonas(userId: number): Promise<Persona[]> {
  const store = await readStore(userId);
  return store.personas;
}

export async function createPersona(userId: number, input: unknown): Promise<Persona> {
  if (!isValidPersonaInput(input)) throw new Error("persona input is invalid");
  const store = await readStore(userId);
  if (store.personas.length >= MAX_PERSONAS_PER_USER) throw new Error("persona limit reached");
  const persona = buildPersona(`custom-${randomUUID()}`, input);
  store.personas.push(persona);
  await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
  return persona;
}

export async function deletePersona(userId: number, personaId: string): Promise<void> {
  const store = await readStore(userId);
  const next = store.personas.filter((persona) => persona.id !== personaId);
  if (next.length === store.personas.length) throw new Error("persona not found");
  store.personas = next;
  await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
}
