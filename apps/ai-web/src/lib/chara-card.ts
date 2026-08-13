// chara_card_v3 角色卡转换：与 SillyTavern 等生态互导，字段做长度保护。

import { COVER_OPTIONS, type Persona, type PersonaInput } from "@/lib/personas";

export type CharaCardV3 = {
  spec: "chara_card_v3";
  spec_version: string;
  data: Record<string, unknown>;
};

const LIMITS = {
  name: 32,
  avatar: 32,
  cover: 24,
  description: 4000,
  firstMessage: 2000,
  style: 600,
  world: 4000,
  scenario: 2000,
  plot: 4000,
  examples: 4000,
  maxTags: 8,
  tag: 20,
} as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cut(value: string, max: number): string {
  return value.slice(0, max);
}

export function personaToCharaCardV3(persona: Persona): CharaCardV3 {
  return {
    spec: "chara_card_v3",
    spec_version: "2.0",
    data: {
      name: persona.name,
      description: persona.description,
      personality: persona.style || "",
      scenario: persona.scenario || "",
      first_mes: persona.firstMessage,
      mes_example: persona.examples || "",
      world_scenario: persona.world || "",
      tags: persona.tags || [],
      extensions: {
        style: persona.style,
        world: persona.world,
        plot: persona.plot,
        avatar: persona.avatar,
        cover: persona.cover,
        faction: persona.faction,
        source: "yanchuaner-ai",
      },
    },
  };
}

export function charaCardV3ToPersonaInput(raw: unknown): PersonaInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid chara card");
  const candidate = raw as Record<string, unknown>;
  if (candidate.spec !== "chara_card_v3" || !candidate.data || typeof candidate.data !== "object") {
    throw new Error("invalid chara card");
  }
  const data = candidate.data as Record<string, unknown>;
  const name = text(data.name);
  const description = cut(
    [text(data.description), text(data.personality)].filter(Boolean).join("\n"),
    LIMITS.description,
  );
  if (!name || !description) throw new Error("invalid chara card");
  const extensions =
    data.extensions && typeof data.extensions === "object"
      ? (data.extensions as Record<string, unknown>)
      : {};
  const cover = text(extensions.cover);
  const tags = Array.isArray(data.tags)
    ? data.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, LIMITS.maxTags)
        .map((tag) => cut(tag, LIMITS.tag))
    : undefined;
  const firstMessage = cut(text(data.first_mes), LIMITS.firstMessage) || `你好，我是${name}。`;
  return {
    name: cut(name, LIMITS.name),
    description,
    firstMessage,
    style: cut(text(extensions.style), LIMITS.style) || undefined,
    world: cut(text(data.world_scenario) || text(extensions.world), LIMITS.world) || undefined,
    scenario: cut(text(data.scenario), LIMITS.scenario) || undefined,
    plot: cut(text(extensions.plot), LIMITS.plot) || undefined,
    examples: cut(text(data.mes_example), LIMITS.examples) || undefined,
    avatar: cut(text(extensions.avatar), LIMITS.avatar) || undefined,
    cover: cover && COVER_OPTIONS.includes(cover as (typeof COVER_OPTIONS)[number]) ? cover : undefined,
    faction: cut(text(extensions.faction), 24) || undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
  };
}
