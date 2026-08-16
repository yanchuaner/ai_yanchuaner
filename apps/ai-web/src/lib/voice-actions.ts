// BYOK 语音 actions：ASR/TTS 设置、语音转写与语音合成。

import { actionRequest, ActionError, isRecord, type JsonRecord } from "@/lib/action-http";

export type VoiceSettingsView = {
  asr: { baseUrl: string; model: string } | null;
  tts: { baseUrl: string; model: string; voice?: string } | null;
  updatedAt: number;
};

export type VoiceSettingsInput = {
  asr?: { baseUrl: string; model: string; apiKey?: string } | null;
  tts?: { baseUrl: string; model: string; voice?: string; apiKey?: string } | null;
};

function parseVoiceProvider(value: unknown): { baseUrl: string; model: string; voice?: string } | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.baseUrl !== "string" || typeof value.model !== "string") {
    throw new ActionError("invalid", "语音设置响应格式无效。");
  }
  return {
    baseUrl: value.baseUrl,
    model: value.model,
    voice: typeof value.voice === "string" ? value.voice : undefined,
  };
}

function parseVoiceSettings(value: unknown): VoiceSettingsView {
  if (!isRecord(value) || typeof value.updatedAt !== "number") {
    throw new ActionError("invalid", "语音设置响应格式无效。");
  }
  return {
    asr: parseVoiceProvider(value.asr ?? null),
    tts: parseVoiceProvider(value.tts ?? null),
    updatedAt: value.updatedAt,
  };
}

export async function getVoiceSettings(fetcher: typeof fetch = fetch): Promise<VoiceSettingsView> {
  const body = await actionRequest<JsonRecord>("/api/me/voice", {}, fetcher);
  return parseVoiceSettings(body.settings);
}

export async function updateVoiceSettings(
  input: VoiceSettingsInput,
  fetcher: typeof fetch = fetch,
): Promise<VoiceSettingsView> {
  const body = await actionRequest<JsonRecord>(
    "/api/me/voice",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );
  return parseVoiceSettings(body.settings);
}

export async function clearVoiceSection(
  section: "asr" | "tts",
  fetcher: typeof fetch = fetch,
): Promise<VoiceSettingsView> {
  return updateVoiceSettings({ [section]: null } as VoiceSettingsInput, fetcher);
}

export async function transcribeVoice(file: File, fetcher: typeof fetch = fetch): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const body = await actionRequest<JsonRecord>(
    "/api/me/voice/asr",
    { method: "POST", body: form },
    fetcher,
  );
  if (typeof body.text !== "string" || !body.text) throw new ActionError("invalid", "语音转写响应格式无效。");
  return body.text;
}

export async function synthesizeSpeech(
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  let response: Response;
  try {
    response = await fetcher("/api/me/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new ActionError("network", "网络请求失败。");
  }
  if (response.status === 401) throw new ActionError("unauthenticated", "登录会话已失效。", 401);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message =
      body && typeof body.error === "string" ? body.error : "语音合成失败。";
    throw new ActionError(response.status >= 500 ? "unavailable" : "invalid", message, response.status);
  }
  return {
    audio: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}
