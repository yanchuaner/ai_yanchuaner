// 故事世界观：独立于角色库的剧本实体，群聊开本时快照进会话。

import { randomUUID } from "node:crypto";
import { readJsonFile, userStorePath, writeJsonFile } from "@/lib/store";

export type World = {
  id: string;
  title: string;
  description: string;
  timeline: string;
  outline: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
};

export type WorldSnapshot = {
  title: string;
  description: string;
  timeline: string;
  outline: string;
};

export type WorldInput = {
  title: string;
  description: string;
  timeline?: string;
  outline?: string;
  tags?: string[];
};

type WorldStore = {
  worlds: World[];
};

const LIMITS = {
  title: 60,
  description: 6000,
  timeline: 4000,
  outline: 12000,
  maxTags: 8,
  tag: 20,
} as const;

const MAX_WORLDS = 100;
const MAX_STORE_BYTES = 2 * 1024 * 1024;

function storePath(userId: number): string {
  return userStorePath("worlds", userId);
}

function isValidWorld(value: unknown): value is World {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.timeline === "string" &&
    typeof candidate.outline === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

function isValidStore(value: unknown): value is WorldStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Array.isArray((value as Record<string, unknown>).worlds);
}

async function readStore(userId: number): Promise<WorldStore> {
  const store = await readJsonFile<WorldStore>(storePath(userId), { worlds: [] }, isValidStore);
  return { worlds: store.worlds.filter(isValidWorld) };
}

async function writeStore(userId: number, store: WorldStore): Promise<void> {
  await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
}

export function isValidWorldInput(value: unknown): value is WorldInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0 || candidate.title.length > LIMITS.title) {
    return false;
  }
  if (
    typeof candidate.description !== "string" ||
    candidate.description.trim().length === 0 ||
    candidate.description.length > LIMITS.description
  ) {
    return false;
  }
  for (const key of ["timeline", "outline"] as const) {
    const item = candidate[key];
    if (item !== undefined && (typeof item !== "string" || item.length > LIMITS[key])) return false;
  }
  if (candidate.tags !== undefined) {
    if (!Array.isArray(candidate.tags) || candidate.tags.length > LIMITS.maxTags) return false;
    for (const tag of candidate.tags) {
      if (typeof tag !== "string" || tag.trim().length === 0 || tag.length > LIMITS.tag) return false;
    }
  }
  return true;
}

function normalizeInput(
  input: WorldInput,
): { title: string; description: string; timeline: string; outline: string; tags?: string[] } {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    timeline: input.timeline?.trim() || "",
    outline: input.outline?.trim() || "",
    tags: input.tags
      ? [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, LIMITS.maxTags)
      : undefined,
  };
}

export async function listWorlds(userId: number): Promise<World[]> {
  const store = await readStore(userId);
  return store.worlds.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getWorld(userId: number, worldId: string): Promise<World | null> {
  const store = await readStore(userId);
  return store.worlds.find((world) => world.id === worldId) ?? null;
}

export async function createWorld(userId: number, input: WorldInput): Promise<World> {
  if (!isValidWorldInput(input)) throw new Error("world is invalid");
  const normalized = normalizeInput(input);
  const store = await readStore(userId);
  if (store.worlds.length >= MAX_WORLDS) throw new Error("world limit reached");
  const now = Date.now();
  const world: World = {
    id: randomUUID(),
    title: normalized.title,
    description: normalized.description,
    timeline: normalized.timeline,
    outline: normalized.outline,
    tags: normalized.tags,
    createdAt: now,
    updatedAt: now,
  };
  store.worlds.push(world);
  await writeStore(userId, store);
  return world;
}

export async function updateWorld(
  userId: number,
  worldId: string,
  input: WorldInput,
): Promise<World> {
  if (!isValidWorldInput(input)) throw new Error("world is invalid");
  const store = await readStore(userId);
  const index = store.worlds.findIndex((world) => world.id === worldId);
  if (index < 0) throw new Error("world not found");
  const normalized = normalizeInput(input);
  const updated: World = {
    ...store.worlds[index],
    title: normalized.title,
    description: normalized.description,
    timeline: normalized.timeline,
    outline: normalized.outline,
    tags: normalized.tags,
    updatedAt: Date.now(),
  };
  store.worlds[index] = updated;
  await writeStore(userId, store);
  return updated;
}

export async function deleteWorld(userId: number, worldId: string): Promise<void> {
  const store = await readStore(userId);
  const next = store.worlds.filter((world) => world.id !== worldId);
  if (next.length === store.worlds.length) throw new Error("world not found");
  store.worlds = next;
  await writeStore(userId, store);
}
