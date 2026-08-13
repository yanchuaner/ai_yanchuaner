// 嵌入请求统一走 api.* 控制面：额度、限流与审计与聊天请求一致。

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
  const response = await fetcher(new URL("/v1/embeddings", apiBaseUrl), {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
      "X-YanCore-Application": "ai-web",
    },
    body: JSON.stringify({ model, input: inputs }),
  });
  if (!response.ok) {
    throw new Error(`embedding request failed: ${response.status}`);
  }
  const body = (await response.json()) as {
    model?: unknown;
    data?: unknown;
    usage?: { prompt_tokens?: unknown; total_tokens?: unknown };
  };
  if (!Array.isArray(body.data) || body.data.length !== inputs.length) {
    throw new Error("embedding response is invalid");
  }
  const vectors = body.data
    .slice()
    .sort((a, b) => {
      const indexA = (a as { index?: number }).index ?? 0;
      const indexB = (b as { index?: number }).index ?? 0;
      return indexA - indexB;
    })
    .map((item) => {
      const embedding = (item as { embedding?: unknown }).embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error("embedding response is invalid");
      }
      return embedding as number[];
    });
  return {
    model: typeof body.model === "string" ? body.model : model,
    vectors,
    usage: {
      prompt_tokens: typeof body.usage?.prompt_tokens === "number" ? body.usage.prompt_tokens : 0,
      total_tokens: typeof body.usage?.total_tokens === "number" ? body.usage.total_tokens : 0,
    },
  };
}

// 从用户可用模型里挑选嵌入模型：优先配置项，其次按名字识别。
export function pickEmbeddingModel(models: string[], preferred?: string): string | null {
  if (preferred && models.includes(preferred)) return preferred;
  return models.find((model) => /embed|bge|m3|vector/i.test(model)) ?? null;
}
