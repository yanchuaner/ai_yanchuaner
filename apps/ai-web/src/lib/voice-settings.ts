// 用户自配语音凭据：ASR/TTS 的 Base URL、模型与加密 Key。

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { readJsonFile, userStorePath, writeJsonFile } from "@/lib/store";

export type VoiceProviderSettings = {
  baseUrl: string;
  model: string;
  voice?: string;
  apiKeyEncrypted: string;
};

export type VoiceSettingsInput = {
  asr?: { baseUrl: string; model: string; apiKey?: string } | null;
  tts?: { baseUrl: string; model: string; voice?: string; apiKey?: string } | null;
};

export type VoiceSettingsView = {
  asr: { baseUrl: string; model: string } | null;
  tts: { baseUrl: string; model: string; voice?: string } | null;
  updatedAt: number;
};

type VoiceStore = {
  asr?: VoiceProviderSettings;
  tts?: VoiceProviderSettings;
  updatedAt: number;
};

const MAX_STORE_BYTES = 256 * 1024;

function storePath(userId: number): string {
  return userStorePath("voice", userId);
}

function isValidStore(value: unknown): value is VoiceStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof (value as Record<string, unknown>).updatedAt === "number";
}

export function validateVoiceProvider(
  input: { baseUrl: string; model: string; voice?: string; apiKey?: string },
  allowInsecure: boolean,
): string | null {
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    return "服务地址无效。";
  }
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    return "服务地址必须使用 HTTPS。";
  }
  if (!input.model.trim() || input.model.length > 128) return "模型名称无效。";
  if (input.voice !== undefined && (input.voice.length === 0 || input.voice.length > 64)) {
    return "音色名称无效。";
  }
  if (input.apiKey !== undefined && (input.apiKey.length === 0 || input.apiKey.length > 512)) {
    return "API Key 无效。";
  }
  return null;
}

async function readStore(userId: number): Promise<VoiceStore> {
  return readJsonFile<VoiceStore>(storePath(userId), { updatedAt: 0 }, isValidStore);
}

export async function getVoiceSettings(userId: number): Promise<VoiceSettingsView> {
  const store = await readStore(userId);
  return {
    asr: store.asr ? { baseUrl: store.asr.baseUrl, model: store.asr.model } : null,
    tts: store.tts ? { baseUrl: store.tts.baseUrl, model: store.tts.model, voice: store.tts.voice } : null,
    updatedAt: store.updatedAt,
  };
}

export async function updateVoiceSettings(
  userId: number,
  masterSecret: string,
  input: VoiceSettingsInput,
  allowInsecure: boolean,
): Promise<VoiceSettingsView> {
  const store = await readStore(userId);
  const apply = (
    section: "asr" | "tts",
    value:
      | { baseUrl: string; model: string; voice?: string; apiKey?: string }
      | null
      | undefined,
  ) => {
    if (value === null) {
      delete store[section];
      return;
    }
    if (!value) return;
    const invalid = validateVoiceProvider(value, allowInsecure);
    if (invalid) throw new Error(invalid);
    const existing = store[section];
    const baseUrl = value.baseUrl.trim().replace(/\/+$/, "");
    const model = value.model.trim();
    const voice = value.voice?.trim() || existing?.voice;
    const apiKey =
      value.apiKey !== undefined && value.apiKey.length > 0
        ? encryptSecret(value.apiKey.trim(), masterSecret)
        : existing?.apiKeyEncrypted;
    if (!apiKey) throw new Error("请填写 API Key，或留空保持不变。");
    store[section] = {
      baseUrl,
      model,
      voice: voice || undefined,
      apiKeyEncrypted: apiKey,
    };
  };
  apply("asr", input.asr);
  apply("tts", input.tts);
  store.updatedAt = Date.now();
  await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
  return getVoiceSettings(userId);
}

export async function getDecryptedVoiceProvider(
  userId: number,
  section: "asr" | "tts",
  masterSecret: string,
): Promise<{ baseUrl: string; model: string; voice?: string; apiKey: string } | null> {
  const store = await readStore(userId);
  const settings = store[section];
  if (!settings) return null;
  const apiKey = decryptSecret(settings.apiKeyEncrypted, masterSecret);
  if (!apiKey) return null;
  return { baseUrl: settings.baseUrl, model: settings.model, voice: settings.voice, apiKey };
}
