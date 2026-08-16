import type { Preferences } from "@/lib/preferences";
import type { PreferencesRepository } from "@/lib/preferences-repository";

const stores = new Map<number, Preferences>();

export function createMemoryPreferencesRepository(): PreferencesRepository {
  return {
    async get(userId) {
      return stores.get(userId) ?? { favoritePersonaIds: [] };
    },
    async setFavorites(userId, ids) {
      if (ids.length > 200) throw new Error("favorites are invalid");
      for (const id of ids) {
        if (typeof id !== "string" || id.length === 0 || id.length > 64) throw new Error("favorites are invalid");
      }
      const preferences = { favoritePersonaIds: [...new Set(ids)] };
      stores.set(userId, preferences);
      return preferences;
    },
  };
}
