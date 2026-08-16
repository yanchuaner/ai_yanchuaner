// 世界库 actions：列表、创建、更新、删除与单条读取。

import type { World, WorldInput } from "@/lib/worlds";
import { actionRequest, ActionError, isRecord, type JsonRecord } from "@/lib/action-http";

function parseWorld(value: unknown): World {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    throw new ActionError("invalid", "世界观响应格式无效。");
  }
  return value as World;
}

export async function listWorlds(fetcher: typeof fetch = fetch): Promise<World[]> {
  const body = await actionRequest<JsonRecord>("/api/worlds", {}, fetcher);
  if (!Array.isArray(body.worlds)) throw new ActionError("invalid", "世界观列表响应格式无效。");
  return body.worlds.map(parseWorld);
}

export async function getWorld(id: string, fetcher: typeof fetch = fetch): Promise<World> {
  const body = await actionRequest<JsonRecord>(
    `/api/worlds/${encodeURIComponent(id)}`,
    {},
    fetcher,
  );
  return parseWorld(body.world);
}

export async function createWorld(
  input: WorldInput,
  fetcher: typeof fetch = fetch,
): Promise<World> {
  const body = await actionRequest<JsonRecord>(
    "/api/worlds",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );
  return parseWorld(body.world);
}

export async function updateWorld(
  id: string,
  input: WorldInput,
  fetcher: typeof fetch = fetch,
): Promise<World> {
  const body = await actionRequest<JsonRecord>(
    `/api/worlds/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );
  return parseWorld(body.world);
}

export async function deleteWorld(id: string, fetcher: typeof fetch = fetch): Promise<void> {
  await actionRequest<JsonRecord>(
    `/api/worlds/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    fetcher,
  );
}
