// 对话记忆生成：经 api.* 用会话模型压缩对话为角色长期事实。

export type MemoryGenerationResult = {
  summary: string;
  model: string;
};

export type MemoryGenerationOptions = {
  speakerName?: string;
  speakerMap?: Record<string, string>;
};

export async function generateConversationMemory(
  apiBaseUrl: URL,
  accessKey: string,
  model: string,
  messages: { role: string; content: string; personaId?: string }[],
  fetcher: typeof fetch = fetch,
  options: MemoryGenerationOptions = {},
): Promise<MemoryGenerationResult> {
  const transcript = messages
    .slice(-40)
    .map((message) => {
      if (message.role === "user") return `用户: ${message.content}`;
      if (message.role === "assistant") {
        const name = message.personaId ? options.speakerMap?.[message.personaId] : undefined;
        return `${name || "角色"}: ${message.content}`;
      }
      return `系统: ${message.content}`;
    })
    .join("\n");
  const systemPrompt = options.speakerName
    ? `你是记忆整理助手。把对话压缩成 3 到 5 条简短的长期事实，以「${options.speakerName}」的视角用第三人称陈述该角色已经知道的事情；只写该角色亲历或听到的确定事实，不猜测、不评价、不编造。`
    : "你是记忆整理助手。把对话压缩成 3 到 5 条简短的长期事实，用第三人称陈述角色已经知道的事情；只写确定的事实，不猜测、不评价、不编造。";
  const response = await fetcher(new URL("/v1/chat/completions", apiBaseUrl), {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
      "X-YanCore-Application": "ai-web",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        { role: "user", content: `请整理以下对话：\n${transcript}` },
      ],
    }),
  });
  if (!response.ok) throw new Error("memory generation failed");
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("memory generation failed");
  return { summary: content.trim().slice(0, 4000), model };
}
