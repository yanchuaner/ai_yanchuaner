// 群聊提示与调度辅助：纯函数，供 group/v1 使用。

import type { AiChatMessage, AiChatRequest } from "@/lib/chat";
import type { ConversationDetail, StoredMessage } from "@/lib/conversations";
import type { KnowledgeHit } from "@/lib/knowledge-library";
import type { Persona } from "@/lib/personas";

export function ensureLatestUser(history: StoredMessage[], parsed: AiChatRequest): StoredMessage[] {
  if ([...history].reverse().some((message) => message.role === "user")) return history;
  const fallback = [...parsed.messages].reverse().find((message) => message.role === "user")?.content;
  if (!fallback) return history;
  return [...history, { id: `pending-${Date.now()}`, role: "user", content: fallback }];
}

export function buildSchedulerPrompt(
  cast: Persona[],
  director?: Persona,
  world?: ConversationDetail["world"],
  userRole?: ConversationDetail["userRole"],
): string {
  const lines = [
    "你是多人群聊的调度器，只决定本轮由谁发言，不参与对话，也不要生成任何台词。",
    "",
    "群聊成员：",
    ...cast.map((persona) => `- ${persona.name}：${persona.description.slice(0, 120)}`),
  ];
  if (director) {
    lines.push("", `主持人（只营造场景氛围，不发言）：${director.name}`, director.description.slice(0, 200));
  }
  if (world) lines.push("", buildWorldPrompt(world));
  if (userRole) {
    lines.push("", `用户当前扮演：${userRole.name}${userRole.description ? `（${userRole.description.slice(0, 200)}）` : ""}`);
  }
  lines.push(
    "",
    "根据用户消息和剧情需要，选择 1 到 2 位最合适的成员发言：",
    "- 只有一位成员适合回应时，只选 1 位；",
    "- 多位成员都在场且都能自然回应时，最多选 2 位；",
    "- 某位成员正在讲述一个话题、用户追问该话题时，只让该成员回应；",
    "- 主持人绝不发言，即使主持人名字出现在成员信息里也不能选；",
    "- 用户消息明确点名某位成员时，只选择被点名的成员；",
    "- 不要编造成员名称。",
    "",
    '只输出 JSON，不要解释：{"speakers":["成员A"]} 或 {"speakers":["成员A","成员B"]}',
  );
  return lines.join("\n");
}

export function parseSpeakerNames(raw: unknown, cast: Persona[]): Persona[] {
  let speakers: unknown[] = [];
  if (typeof raw === "string") {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as { speakers?: unknown };
        if (Array.isArray(parsed.speakers)) speakers = parsed.speakers;
      } catch {
        // 解析失败走回退。
      }
    }
  } else if (raw && typeof raw === "object") {
    const candidate = raw as { speakers?: unknown };
    if (Array.isArray(candidate.speakers)) speakers = candidate.speakers;
  }
  const selected: Persona[] = [];
  for (const item of speakers) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    const persona =
      cast.find((candidate) => candidate.name === name) ??
      cast.find((candidate) => name.startsWith(candidate.name) || candidate.name.startsWith(name));
    if (persona && !selected.some((picked) => picked.id === persona.id)) selected.push(persona);
    if (selected.length >= 2) break;
  }
  return selected;
}

export function pickFallbackSpeakers(cast: Persona[]): Persona[] {
  const pool = [...cast];
  const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  if (!first) return [];
  const second =
    pool.length > 0 && Math.random() < 0.5
      ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
      : undefined;
  return second ? [first, second] : [first];
}

export function formatGroupHistory(
  messages: StoredMessage[],
  cast: Persona[],
  userRoleName?: string,
): AiChatMessage[] {
  const lines = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      if (message.role === "user") {
        return { role: "user" as const, content: userRoleName ? `${userRoleName}：${message.content}` : message.content };
      }
      const speaker = message.personaId ? cast.find((persona) => persona.id === message.personaId) : undefined;
      return { role: "assistant" as const, content: speaker ? `${speaker.name}：${message.content}` : message.content };
    });
  const recent = lines.slice(-24);
  let total = 0;
  const trimmed: AiChatMessage[] = [];
  for (const line of recent.reverse()) {
    if (total + line.content.length > 24_000) break;
    trimmed.push(line);
    total += line.content.length;
  }
  return trimmed.reverse();
}

export function buildGroupSpeakerPrompt(
  speaker: Persona,
  cast: Persona[],
  director?: Persona,
  world?: ConversationDetail["world"],
  userRole?: ConversationDetail["userRole"],
): string {
  const optional = (title: string, value: string | undefined) => (value?.trim() ? `${title}\n${value}` : "");
  const lines = [
    `你是「${speaker.name}」，正在与用户和其他成员进行群聊。`,
    `【角色卡】\n${speaker.description}`,
    optional("【世界观】", speaker.world),
    optional("【当前场景】", speaker.scenario),
    optional("【故事线】", speaker.plot),
    optional("【说话风格】", speaker.style),
    optional("【示例对话】", speaker.examples),
    "",
    "在场的其他成员：",
    cast
      .filter((persona) => persona.id !== speaker.id)
      .map((persona) => `- ${persona.name}：${persona.description.slice(0, 100)}`)
      .join("\n") || "（暂无其他成员）",
  ];
  if (director) lines.push("", `主持人背景（只营造场景氛围，不替角色发言）：${director.description.slice(0, 200)}`);
  if (world) lines.push("", buildWorldPrompt(world));
  if (userRole) {
    lines.push(
      "",
      `用户扮演的角色是「${userRole.name}」${userRole.description ? `，人设：${userRole.description.slice(0, 300)}` : ""}。请直接与这位角色互动，用这个称呼称呼对方。`,
    );
  }
  lines.push(
    "",
    "规则：直接输出你作为该角色要说的话，不要带「角色名：」前缀，不要替其他角色发言，不要跳回调度视角；用中文回复，保持角色一致。",
    "历史消息中的「角色名：」只是说话人标注，不要模仿这种格式；不要自呼其名，也不要向自己提问。",
    "你只负责自己的话：不要把其他角色的台词写成「角色名：内容」，也不要转述或预演他们的话。想表达其他人的反应时，用你自己的口吻评价或猜测（例如“猪国那家伙肯定又要吹牛了”），其他角色会由系统安排自行回应。",
  );
  return lines.join("\n\n").slice(0, 8000);
}

export function buildWorldPrompt(world: ConversationDetail["world"]): string {
  if (!world) return "";
  const { title, description, timeline, outline } = world.snapshot;
  return [
    `【世界：${title}】`,
    description ? `世界观：${description}` : "",
    timeline ? `时间线：${timeline}` : "",
    outline ? `故事大纲：${outline.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildKnowledgePrompt(hits: KnowledgeHit[]): string {
  const lines = ["以下是角色资料库中检索到的片段。回答时优先使用这些资料，资料不足就明确说明："];
  let used = 0;
  for (const hit of hits) {
    const block = `【资料 ${lines.length}】来自《${hit.documentName}》\n${hit.text}`;
    if (used + block.length > 6000) break;
    lines.push(block);
    used += block.length;
  }
  return lines.join("\n\n");
}

export function dedupeHits(hits: KnowledgeHit[]): KnowledgeHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.text)) return false;
    seen.add(hit.text);
    return true;
  });
}
