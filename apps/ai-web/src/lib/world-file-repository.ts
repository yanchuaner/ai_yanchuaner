import { createWorld, deleteWorld, getWorld, listWorlds, updateWorld } from "@/lib/worlds";
import type { WorldRepository } from "@/lib/world-repository";

export function createFileWorldRepository(): WorldRepository {
  return {
    list: (userId) => listWorlds(userId),
    get: (userId, worldId) => getWorld(userId, worldId),
    create: (userId, input) => createWorld(userId, input),
    update: (userId, worldId, input) => updateWorld(userId, worldId, input),
    delete: (userId, worldId) => deleteWorld(userId, worldId),
  };
}
