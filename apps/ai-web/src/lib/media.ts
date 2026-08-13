// 用户自配媒体服务的 OpenAI 兼容转发：视觉理解与文生图。

export async function forwardVision(
  baseUrl: string,
  apiKey: string,
  model: string,
  imageDataUrl: string,
  prompt: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(new URL("/v1/chat/completions", baseUrl), {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`视觉理解失败（${response.status}）。`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("视觉理解未返回内容。");
  return content.trim().slice(0, 2000);
}

export async function forwardImageGeneration(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(new URL("/v1/images/generations", baseUrl), {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, n: 1 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`图片生成失败（${response.status}）。`);
  const body = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const item = body.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error("图片生成未返回结果。");
}
