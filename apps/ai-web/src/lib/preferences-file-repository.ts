import { getPreferences, setFavoritePersonas } from "@/lib/preferences";
import type { PreferencesRepository } from "@/lib/preferences-repository";

export function createFilePreferencesRepository(): PreferencesRepository {
  return {
    get: (userId) => getPreferences(userId),
    setFavorites: (userId, ids) => setFavoritePersonas(userId, ids),
  };
}
