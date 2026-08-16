import { isValidWorldInput, type World, type WorldInput } from "@/lib/worlds";
import type { WorldRepository } from "@/lib/world-repository";

const stores = new Map<number, World[]>();

function storeFor(userId: number): World[] {
  if (!stores.has(userId)) stores.set(userId, []);
  return stores.get(userId)!;
}

export function createMemoryWorldRepository(): WorldRepository {
  return {
    async list(userId) {
      return storeFor(userId).slice();
    },
    async get(userId, worldId) {
      return storeFor(userId).find((world) => world.id === worldId) ?? null;
    },
    async create(userId, input) {
      if (!isValidWorldInput(input)) throw new Error("world is invalid");
      const now = Date.now();
      const world: World = {
        id: crypto.randomUUID(),
        title: input.title,
        description: input.description,
        timeline: input.timeline ?? "",
        outline: input.outline ?? "",
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      };
      storeFor(userId).push(world);
      return world;
    },
    async update(userId, worldId, input) {
      if (!isValidWorldInput(input)) throw new Error("world is invalid");
      const store = storeFor(userId);
      const index = store.findIndex((world) => world.id === worldId);
      if (index < 0) throw new Error("world not found");
      const world: World = {
        ...store[index],
        title: input.title,
        description: input.description,
        timeline: input.timeline ?? store[index].timeline,
        outline: input.outline ?? store[index].outline,
        tags: input.tags,
        updatedAt: Date.now(),
      };
      store[index] = world;
      return world;
    },
    async delete(userId, worldId) {
      const store = storeFor(userId);
      const next = store.filter((world) => world.id !== worldId);
      if (next.length === store.length) throw new Error("world not found");
      stores.set(userId, next);
    },
  };
}
