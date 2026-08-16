// 上下文贡献者与组装器：每个来源独立返回贡献，组装器统一预算、优先级与裁剪。

import type { AiChatMessage } from "@/lib/chat";
import type { Persona } from "@/lib/personas";

export type ContextSource =
  | "system"
  | "user"
  | "persona"
  | "world"
  | "history"
  | "knowledge"
  | "memory";

export type ContextContribution = {
  source: ContextSource;
  priority: number;
  label: string;
  content: string;
  references?: { id: string; label: string }[];
};

export type ContextAssembleResult = {
  blocks: string[];
  references: { id: string; label: string }[];
  totalChars: number;
};

export function assembleContext(
  contributions: ContextContribution[],
  maxChars = 12_000,
): ContextAssembleResult {
  const seen = new Set<string>();
  const ordered = contributions
    .filter((item) => item.content.trim().length > 0)
    .sort((a, b) => b.priority - a.priority || a.source.localeCompare(b.source));
  const blocks: string[] = [];
  const references: { id: string; label: string }[] = [];
  let totalChars = 0;
  for (const item of ordered) {
    if (seen.has(item.content)) continue;
    seen.add(item.content);
    const block = `【${item.label}】\n${item.content}`;
    const remaining = Math.max(0, maxChars - totalChars);
    if (remaining <= 0) break;
    const trimmed = block.length <= remaining ? block : block.slice(0, remaining);
    blocks.push(trimmed);
    totalChars += trimmed.length;
    for (const ref of item.references ?? []) {
      if (!references.some((existing) => existing.id === ref.id)) references.push(ref);
    }
  }
  return { blocks, references, totalChars };
}

export function systemPolicyContributor(): ContextContribution {
  return {
    source: "system",
    priority: 100,
    label: "系统策略",
    content:
      "你正在燕中 AI 角色扮演中。只以指定角色身份回复用户，不跳出角色，不替其他角色发言，不使用供应商或系统内部细节。",
  };
}

export function personaSnapshotContributor(persona: Persona): ContextContribution {
  const optional = (title: string, value: string | undefined) => (value?.trim() ? `${title}\n${value}` : "");
  const content = [
    `你是「${persona.name}」。`,
    `【角色卡】\n${persona.description}`,
    optional("【世界观】", persona.world),
    optional("【当前场景】", persona.scenario),
    optional("【故事线】", persona.plot),
    optional("【说话风格】", persona.style),
    optional("【示例对话】", persona.examples),
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    source: "persona",
    priority: 90,
    label: "角色设定",
    content,
    references: [{ id: persona.id, label: persona.name }],
  };
}

export function worldSnapshotContributor(
  world?: { snapshot: { title: string; description: string; timeline: string; outline: string } },
): ContextContribution | null {
  if (!world?.snapshot) return null;
  const { title, description, timeline, outline } = world.snapshot;
  const content = [
    `【世界：${title}】`,
    description ? `世界观：${description}` : "",
    timeline ? `时间线：${timeline}` : "",
    outline ? `故事大纲：${outline.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    source: "world",
    priority: 80,
    label: "故事世界",
    content,
    references: [{ id: title, label: title }],
  };
}

export function historyContributor(history: AiChatMessage[]): ContextContribution {
  const content = history
    .map((message) => `${message.role === "user" ? "用户" : "角色"}：${message.content}`)
    .join("\n")
    .slice(-8000);
  return {
    source: "history",
    priority: 60,
    label: "对话历史",
    content: content || "（暂无历史消息）",
  };
}

export function memoryContributor(memory: { summary: string } | null): ContextContribution | null {
  if (!memory?.summary?.trim()) return null;
  return {
    source: "memory",
    priority: 70,
    label: "角色长期记忆",
    content: memory.summary,
  };
}

export function knowledgeContributor(
  hits: { documentName: string; text: string }[],
): ContextContribution | null {
  if (hits.length === 0) return null;
  const lines = ["以下是资料库检索到的片段，回答时优先使用："];
  let used = 0;
  for (const hit of hits) {
    const block = `【资料 ${lines.length}】来自《${hit.documentName}》\n${hit.text}`;
    if (used + block.length > 6000) break;
    lines.push(block);
    used += block.length;
  }
  return {
    source: "knowledge",
    priority: 50,
    label: "资料检索",
    content: lines.join("\n\n"),
    references: hits.map((hit) => ({ id: hit.documentName, label: hit.documentName })),
  };
}
