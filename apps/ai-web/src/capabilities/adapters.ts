// 能力适配器：workflow 只依赖 capability_id，provider/model 选择收口到这里。

import { capabilityRegistry, CapabilityRegistryError } from "@/capabilities/registry";

export type CapabilityAdapter = {
  resolveModel(capabilityId: string): string;
  resolveEmbeddingModel?(): string | null;
  resolveKnowledgeThreshold?(): number;
};

export function createCapabilityAdapter(options?: {
  model?: string;
  embeddingModel?: string | null;
}): CapabilityAdapter {
  return {
    resolveModel(capabilityId) {
      const capability = capabilityRegistry.get(capabilityId);
      if (!capability) throw new CapabilityRegistryError(`未知能力：${capabilityId}`);
      return options?.model?.trim() || process.env.AI_WEB_CHAT_MODEL?.trim() || "deepseek-v4-flash";
    },
    resolveEmbeddingModel() {
      if (options?.embeddingModel !== undefined) return options.embeddingModel;
      return process.env.AI_WEB_EMBEDDING_MODEL?.trim() || "BAAI/bge-m3";
    },
    resolveKnowledgeThreshold() {
      const parsed = Number(process.env.AI_WEB_KNOWLEDGE_THRESHOLD);
      return Number.isFinite(parsed) ? parsed : 0.3;
    },
  };
}
