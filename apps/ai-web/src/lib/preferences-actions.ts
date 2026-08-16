// 用户偏好 actions：收藏角色列表的读取与更新。

import { actionRequest, ActionError, isRecord, type JsonRecord } from "@/lib/action-http";

function parseFavoriteIds(body: JsonRecord): string[] {
  const preferences = body.preferences;
  if (!isRecord(preferences) || !Array.isArray(preferences.favoritePersonaIds)) {
    throw new ActionError("invalid", "收藏列表响应格式无效。");
  }
  return preferences.favoritePersonaIds.filter((item): item is string => typeof item === "string");
}

export async function getFavoritePersonaIds(fetcher: typeof fetch = fetch): Promise<string[]> {
  const body = await actionRequest<JsonRecord>("/api/preferences", {}, fetcher);
  return parseFavoriteIds(body);
}

export async function setFavoritePersonaIds(
  favoritePersonaIds: string[],
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await actionRequest<JsonRecord>(
    "/api/preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoritePersonaIds }),
    },
    fetcher,
  );
}
