// 用户级偏好设置：目前只存角色收藏，后续置顶会话、界面偏好都放这里。

import { readJsonFile, userStorePath, writeJsonFile } from "@/lib/store";

export type Preferences = {
  favoritePersonaIds: string[];
};

const MAX_STORE_BYTES = 256 * 1024;
const MAX_FAVORITES = 200;

function storePath(userId: number): string {
  return userStorePath("preferences", userId);
}

function isValidPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const favorites = (value as Record<string, unknown>).favoritePersonaIds;
  if (!Array.isArray(favorites)) return false;
  return favorites.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64);
}

async function readPreferences(userId: number): Promise<Preferences> {
  return readJsonFile<Preferences>(storePath(userId), { favoritePersonaIds: [] }, isValidPreferences);
}

export async function getPreferences(userId: number): Promise<Preferences> {
  return readPreferences(userId);
}

export async function setFavoritePersonas(userId: number, ids: unknown): Promise<Preferences> {
  if (!Array.isArray(ids) || ids.length > MAX_FAVORITES) throw new Error("favorites are invalid");
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || id.length > 64) throw new Error("favorites are invalid");
  }
  const preferences: Preferences = { favoritePersonaIds: [...new Set(ids)] };
  await writeJsonFile(storePath(userId), preferences, MAX_STORE_BYTES);
  return preferences;
}
