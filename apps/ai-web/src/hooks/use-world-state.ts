// 世界库状态边界：列表、创建、更新与删除。

import { useState } from "react";
import { resolveActionError } from "@/lib/action-error-utils";
import * as worldActions from "@/lib/world-actions";
import type { World, WorldInput } from "@/lib/worlds";

type UseWorldStateOptions = {
  onUnauthenticated: () => void;
};

export function useWorldState({ onUnauthenticated }: UseWorldStateOptions) {
  const [worlds, setWorlds] = useState<World[]>([]);

  async function loadWorlds() {
    try {
      setWorlds(await worldActions.listWorlds());
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
    }
  }

  async function saveWorld(input: WorldInput) {
    try {
      await worldActions.createWorld(input);
      await loadWorlds();
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      if (message) throw new Error(message);
    }
  }

  async function updateWorld(worldId: string, input: WorldInput) {
    try {
      await worldActions.updateWorld(worldId, input);
      await loadWorlds();
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      if (message) throw new Error(message);
    }
  }

  async function removeWorld(worldId: string) {
    try {
      await worldActions.deleteWorld(worldId);
      await loadWorlds();
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      if (message) throw new Error(message);
    }
  }

  return { worlds, setWorlds, loadWorlds, saveWorld, updateWorld, removeWorld };
}
