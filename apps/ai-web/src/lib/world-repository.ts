// 世界库仓储端口。

import type { World, WorldInput } from "@/lib/worlds";

export type WorldRepository = {
  list(userId: number): Promise<World[]>;
  get(userId: number, worldId: string): Promise<World | null>;
  create(userId: number, input: WorldInput): Promise<World>;
  update(userId: number, worldId: string, input: WorldInput): Promise<World>;
  delete(userId: number, worldId: string): Promise<void>;
};
