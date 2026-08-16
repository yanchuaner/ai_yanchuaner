// 角色库 actions：列表、创建、更新、删除、chara_card_v3 导入导出。

import type { Persona, PersonaInput } from "@/lib/personas";
import { actionRequest, ActionError, isRecord, type JsonRecord } from "@/lib/action-http";

function parsePersona(value: unknown): Persona {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    throw new ActionError("invalid", "角色响应格式无效。");
  }
  return value as Persona;
}

export async function listPersonas(fetcher: typeof fetch = fetch): Promise<Persona[]> {
  const body = await actionRequest<JsonRecord>("/api/personas", {}, fetcher);
  if (!Array.isArray(body.personas)) throw new ActionError("invalid", "角色列表响应格式无效。");
  return body.personas.map(parsePersona);
}

export async function createPersona(
  input: PersonaInput,
  fetcher: typeof fetch = fetch,
): Promise<Persona> {
  const body = await actionRequest<JsonRecord>(
    "/api/personas",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: input }),
    },
    fetcher,
  );
  return parsePersona(body.persona);
}

export async function updatePersona(
  id: string,
  input: PersonaInput,
  fetcher: typeof fetch = fetch,
): Promise<Persona> {
  const body = await actionRequest<JsonRecord>(
    `/api/personas/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: input }),
    },
    fetcher,
  );
  return parsePersona(body.persona);
}

export async function deletePersona(id: string, fetcher: typeof fetch = fetch): Promise<void> {
  await actionRequest<JsonRecord>(
    `/api/personas/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    fetcher,
  );
}

export async function importPersonaCard(
  card: unknown,
  fetcher: typeof fetch = fetch,
): Promise<Persona> {
  const body = await actionRequest<JsonRecord>(
    "/api/personas/import",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card }),
    },
    fetcher,
  );
  return parsePersona(body.persona);
}

export async function exportPersonaCard(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<{ text: string; filename: string }> {
  let response: Response;
  try {
    response = await fetcher(`/api/personas/${encodeURIComponent(id)}/export`, {
      cache: "no-store",
    });
  } catch {
    throw new ActionError("network", "网络请求失败。");
  }
  if (response.status === 401) throw new ActionError("unauthenticated", "登录会话已失效。", 401);
  if (response.status === 404) throw new ActionError("not_found", "角色不存在。", 404);
  if (!response.ok) throw new ActionError("invalid", "导出角色失败。", response.status);
  const text = await response.text();
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : "persona.json";
  return { text, filename };
}
