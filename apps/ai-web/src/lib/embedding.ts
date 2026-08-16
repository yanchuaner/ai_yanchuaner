// 嵌入请求统一走 api.* 控制面：额度、限流与审计与聊天请求一致。
import { createYanCoreGateway } from "@/lib/yancore-gateway";

export type EmbeddingResult = {
  model: string;
  vectors: number[][];
  usage: { prompt_tokens: number; total_tokens: number };
};

export async function requestEmbeddings(
  apiBaseUrl: URL,
  accessKey: string,
  model: string,
  inputs: string[],
  fetcher: typeof fetch = fetch,
): Promise<EmbeddingResult> {
  return createYanCoreGateway(apiBaseUrl, fetcher).embeddings(accessKey, model, inputs);
}

// 从用户可用模型里挑选嵌入模型：优先配置项，其次按名字识别。
export function pickEmbeddingModel(models: string[], preferred?: string): string | null {
  if (preferred && models.includes(preferred)) return preferred;
  return models.find((model) => /embed|bge|m3|vector/i.test(model)) ?? null;
}
