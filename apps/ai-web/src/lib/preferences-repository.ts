// 用户偏好仓储端口。

import type { Preferences } from "@/lib/preferences";

export type PreferencesRepository = {
  get(userId: number): Promise<Preferences>;
  setFavorites(userId: number, favoritePersonaIds: string[]): Promise<Preferences>;
};
