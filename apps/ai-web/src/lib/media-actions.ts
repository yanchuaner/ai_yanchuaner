// BYOK 媒体 actions：设置读取/保存/清除，以及画图与视觉理解请求。

import { actionRequest, ActionError, isRecord, type JsonRecord } from "@/lib/action-http";

export type MediaSettingsView = {
  baseUrl: string;
  visionModel: string;
  imageModel: string;
  updatedAt: number;
};

export type MediaSettingsInput = {
  baseUrl?: string;
  visionModel?: string;
  imageModel?: string;
  apiKey?: string;
};

function parseMediaSettings(value: unknown): MediaSettingsView {
  if (
    !isRecord(value) ||
    typeof value.baseUrl !== "string" ||
    typeof value.visionModel !== "string" ||
    typeof value.imageModel !== "string" ||
    typeof value.updatedAt !== "number"
  ) {
    throw new ActionError("invalid", "媒体设置响应格式无效。");
  }
  return {
    baseUrl: value.baseUrl,
    visionModel: value.visionModel,
    imageModel: value.imageModel,
    updatedAt: value.updatedAt,
  };
}

function parseSettingsOrNull(body: JsonRecord): MediaSettingsView | null {
  if (body.settings === null) return null;
  return parseMediaSettings(body.settings);
}

export async function getMediaSettings(fetcher: typeof fetch = fetch): Promise<MediaSettingsView | null> {
  const body = await actionRequest<JsonRecord>("/api/me/media", {}, fetcher);
  return parseSettingsOrNull(body);
}

export async function updateMediaSettings(
  input: MediaSettingsInput,
  fetcher: typeof fetch = fetch,
): Promise<MediaSettingsView | null> {
  const body = await actionRequest<JsonRecord>(
    "/api/me/media",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );
  return parseSettingsOrNull(body);
}

export async function clearMediaSettings(fetcher: typeof fetch = fetch): Promise<void> {
  await actionRequest<JsonRecord>("/api/me/media", { method: "DELETE" }, fetcher);
}

export async function generateImage(prompt: string, fetcher: typeof fetch = fetch): Promise<string> {
  const body = await actionRequest<JsonRecord>(
    "/api/me/image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
    fetcher,
  );
  if (typeof body.image !== "string" || !body.image) throw new ActionError("invalid", "画图响应格式无效。");
  return body.image;
}

export async function describeImage(
  image: string,
  prompt: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const body = await actionRequest<JsonRecord>(
    "/api/me/vision",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, prompt }),
    },
    fetcher,
  );
  if (typeof body.text !== "string" || !body.text) throw new ActionError("invalid", "视觉理解响应格式无效。");
  return body.text;
}
