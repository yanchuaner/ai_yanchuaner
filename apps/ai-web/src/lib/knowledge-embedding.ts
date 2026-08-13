import { pickEmbeddingModel, requestEmbeddings } from "@/lib/embedding";
import type { AiSession } from "@/lib/session";

// 会话级嵌入工具：模型按用户白名单选择，请求经 api.* 记账。
export function resolveEmbeddingModel(session: AiSession): string | null {
  const preferred = process.env.AI_WEB_EMBEDDING_MODEL?.trim() || "BAAI/bge-m3";
  return pickEmbeddingModel(session.credential.models, preferred);
}

export function createSessionEmbedder(session: AiSession, model: string, apiBaseUrl: URL) {
  return async (texts: string[]): Promise<number[][]> => {
    const result = await requestEmbeddings(
      apiBaseUrl,
      session.credential.accessKey,
      model,
      texts,
    );
    return result.vectors;
  };
}
