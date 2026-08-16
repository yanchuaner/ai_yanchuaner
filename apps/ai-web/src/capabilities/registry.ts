// 静态能力注册表：构建期 manifest，工作流只依赖稳定能力 ID。

export type CapabilityScope =
  | "ai.chat"
  | "ai.embedding"
  | "ai.knowledge"
  | "ai.memory"
  | "ai.media"
  | "ai.voice";

export type CapabilityBillingMode = "platform" | "byok" | "none";

export type CapabilityManifest = {
  schemaVersion: "1.0";
  id: string;
  version: string;
  displayName: string;
  modalities: { input: string[]; output: string[] };
  streaming: boolean;
  billing: { mode: CapabilityBillingMode; unit: string };
  availability: "preview" | "stable" | "degraded" | "disabled";
  requiredScopes: CapabilityScope[];
  timeoutMs: number;
  dataEgress: "platform" | "byok" | "none";
  failureStrategy: "no_degrade" | "degrade" | "retry";
};

export const CAPABILITY_MANIFESTS: CapabilityManifest[] = [
  {
    schemaVersion: "1.0",
    id: "text.chat.general",
    version: "1",
    displayName: "通用文本对话",
    modalities: { input: ["text"], output: ["text"] },
    streaming: true,
    billing: { mode: "platform", unit: "token" },
    availability: "preview",
    requiredScopes: ["ai.chat"],
    timeoutMs: 180_000,
    dataEgress: "platform",
    failureStrategy: "no_degrade",
  },
  {
    schemaVersion: "1.0",
    id: "vector.embedding",
    version: "1",
    displayName: "向量嵌入",
    modalities: { input: ["text"], output: ["embedding"] },
    streaming: false,
    billing: { mode: "platform", unit: "token" },
    availability: "preview",
    requiredScopes: ["ai.embedding"],
    timeoutMs: 30_000,
    dataEgress: "platform",
    failureStrategy: "degrade",
  },
  {
    schemaVersion: "1.0",
    id: "knowledge.retrieval",
    version: "1",
    displayName: "资料检索",
    modalities: { input: ["text"], output: ["text"] },
    streaming: false,
    billing: { mode: "none", unit: "none" },
    availability: "preview",
    requiredScopes: ["ai.knowledge"],
    timeoutMs: 10_000,
    dataEgress: "none",
    failureStrategy: "degrade",
  },
  {
    schemaVersion: "1.0",
    id: "memory.summary",
    version: "1",
    displayName: "长期记忆摘要",
    modalities: { input: ["text"], output: ["text"] },
    streaming: false,
    billing: { mode: "platform", unit: "token" },
    availability: "preview",
    requiredScopes: ["ai.memory"],
    timeoutMs: 60_000,
    dataEgress: "platform",
    failureStrategy: "degrade",
  },
  {
    schemaVersion: "1.0",
    id: "media.vision",
    version: "1",
    displayName: "图片理解",
    modalities: { input: ["image"], output: ["text"] },
    streaming: false,
    billing: { mode: "byok", unit: "request" },
    availability: "preview",
    requiredScopes: ["ai.media"],
    timeoutMs: 60_000,
    dataEgress: "byok",
    failureStrategy: "no_degrade",
  },
  {
    schemaVersion: "1.0",
    id: "media.image",
    version: "1",
    displayName: "AI 画图",
    modalities: { input: ["text"], output: ["image"] },
    streaming: false,
    billing: { mode: "byok", unit: "image" },
    availability: "preview",
    requiredScopes: ["ai.media"],
    timeoutMs: 120_000,
    dataEgress: "byok",
    failureStrategy: "no_degrade",
  },
  {
    schemaVersion: "1.0",
    id: "voice.asr",
    version: "1",
    displayName: "语音转文字",
    modalities: { input: ["audio"], output: ["text"] },
    streaming: false,
    billing: { mode: "byok", unit: "request" },
    availability: "preview",
    requiredScopes: ["ai.voice"],
    timeoutMs: 60_000,
    dataEgress: "byok",
    failureStrategy: "no_degrade",
  },
  {
    schemaVersion: "1.0",
    id: "voice.tts",
    version: "1",
    displayName: "文字转语音",
    modalities: { input: ["text"], output: ["audio"] },
    streaming: false,
    billing: { mode: "byok", unit: "request" },
    availability: "preview",
    requiredScopes: ["ai.voice"],
    timeoutMs: 60_000,
    dataEgress: "byok",
    failureStrategy: "no_degrade",
  },
];

const SCOPES = new Set<CapabilityScope>([
  "ai.chat",
  "ai.embedding",
  "ai.knowledge",
  "ai.memory",
  "ai.media",
  "ai.voice",
]);

export class CapabilityRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityRegistryError";
  }
}

export function createCapabilityRegistry(manifests: CapabilityManifest[]) {
  const seen = new Set<string>();
  for (const manifest of manifests) {
    if (seen.has(manifest.id)) throw new CapabilityRegistryError(`能力 ID 重复：${manifest.id}`);
    seen.add(manifest.id);
    for (const scope of manifest.requiredScopes) {
      if (!SCOPES.has(scope)) throw new CapabilityRegistryError(`未知 scope：${scope}`);
    }
    if (manifest.billing.mode === "none" && manifest.billing.unit !== "none") {
      throw new CapabilityRegistryError(`${manifest.id} 的计费声明不完整。`);
    }
    if (manifest.billing.mode !== "none" && manifest.billing.unit === "none") {
      throw new CapabilityRegistryError(`${manifest.id} 的计费声明不完整。`);
    }
  }
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  return {
    list: () => manifests.slice(),
    get: (id: string): CapabilityManifest | null => byId.get(id) ?? null,
  };
}

export const capabilityRegistry = createCapabilityRegistry(CAPABILITY_MANIFESTS);
