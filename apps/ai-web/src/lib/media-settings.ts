// 用户自配媒体凭据：视觉理解与 AI 画图共用一套服务配置，加密落盘。

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { rm } from "node:fs/promises";
import { readJsonFile, userStorePath, writeJsonFile } from "@/lib/store";

export type MediaProviderSettings = {
  baseUrl: string;
  visionModel: string;
  imageModel: string;
  apiKeyEncrypted: string;
};

export type MediaSettingsInput = {
  baseUrl?: string;
  visionModel?: string;
  imageModel?: string;
  apiKey?: string;
};

export type MediaSettingsView = {
  baseUrl: string;
  visionModel: string;
  imageModel: string;
  updatedAt: number;
};

type MediaStore = {
  baseUrl: string;
  visionModel: string;
  imageModel: string;
  apiKeyEncrypted: string;
  updatedAt: number;
};

const MAX_STORE_BYTES = 64 * 1024;

function storePath(userId: number): string {
  return userStorePath("media", userId);
}

function isValidStore(value: unknown): value is MediaStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.baseUrl === "string" &&
    typeof candidate.visionModel === "string" &&
    typeof candidate.imageModel === "string" &&
    typeof candidate.apiKeyEncrypted === "string" &&
    typeof candidate.updatedAt === "number"
  );
}

export function validateMediaSettings(
  input: { baseUrl: string; visionModel: string; imageModel: string; apiKey?: string },
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
  if (!input.visionModel.trim() || input.visionModel.length > 128) return "视觉模型名称无效。";
  if (!input.imageModel.trim() || input.imageModel.length > 128) return "画图模型名称无效。";
  if (input.apiKey !== undefined && (input.apiKey.length === 0 || input.apiKey.length > 512)) {
    return "API Key 无效。";
  }
  return null;
}

async function readStore(userId: number): Promise<MediaStore | null> {
  return readJsonFile<MediaStore | null>(storePath(userId), null, (value): value is MediaStore =>
    value === null || isValidStore(value),
  );
}

export async function getMediaSettings(userId: number): Promise<MediaSettingsView | null> {
  const store = await readStore(userId);
  if (!store) return null;
  return {
    baseUrl: store.baseUrl,
    visionModel: store.visionModel,
    imageModel: store.imageModel,
    updatedAt: store.updatedAt,
  };
}

export async function updateMediaSettings(
  userId: number,
  masterSecret: string,
  input: MediaSettingsInput,
  allowInsecure: boolean,
): Promise<MediaSettingsView | null> {
  const existing = await readStore(userId);
  const baseUrl = input.baseUrl?.trim().replace(/\/+$/, "") || existing?.baseUrl || "";
  const visionModel = input.visionModel?.trim() || existing?.visionModel || "";
  const imageModel = input.imageModel?.trim() || existing?.imageModel || "";
  const invalid = validateMediaSettings({ baseUrl, visionModel, imageModel, apiKey: input.apiKey }, allowInsecure);
  if (invalid) throw new Error(invalid);
  const apiKey =
    input.apiKey !== undefined && input.apiKey.length > 0
      ? encryptSecret(input.apiKey.trim(), masterSecret)
      : existing?.apiKeyEncrypted;
  if (!apiKey) throw new Error("请填写 API Key，或留空保持不变。");
  const store: MediaStore = {
    baseUrl,
    visionModel,
    imageModel,
    apiKeyEncrypted: apiKey,
    updatedAt: Date.now(),
  };
  await writeJsonFile(storePath(userId), store, MAX_STORE_BYTES);
  return getMediaSettings(userId);
}

export async function clearMediaSettings(userId: number): Promise<void> {
  await rm(storePath(userId), { force: true });
}

export async function getDecryptedMediaProvider(
  userId: number,
  masterSecret: string,
): Promise<{ baseUrl: string; visionModel: string; imageModel: string; apiKey: string } | null> {
  const store = await readStore(userId);
  if (!store) return null;
  const apiKey = decryptSecret(store.apiKeyEncrypted, masterSecret);
  if (!apiKey) return null;
  return {
    baseUrl: store.baseUrl,
    visionModel: store.visionModel,
    imageModel: store.imageModel,
    apiKey,
  };
}
