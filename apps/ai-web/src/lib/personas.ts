// 角色卡模型与预设
//
// 字段刻意保持独立、可选，便于后续扩展：
// - 多 AI 群聊只在会话上增加 cast: Persona[] 与导演/场景编排字段，
//   角色卡本身不需要迁移；
// - 语音、头像图片等能力可以放在角色卡之外单独配置，不与对话逻辑耦合。

export type Persona = {
  id: string;
  name: string;
  avatar?: string;
  description: string;
  firstMessage: string;
  style?: string;
  world?: string;
  scenario?: string;
  plot?: string;
  tags?: string[];
};

export type PersonaInput = Omit<Persona, "id">;

const LIMITS = {
  name: 32,
  avatar: 32,
  description: 4000,
  firstMessage: 2000,
  style: 600,
  world: 4000,
  scenario: 2000,
  plot: 4000,
  maxTags: 8,
  tag: 20,
} as const;

export function isValidPersonaInput(value: unknown): value is PersonaInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0 || candidate.name.length > LIMITS.name) {
    return false;
  }
  if (
    typeof candidate.description !== "string" ||
    candidate.description.trim().length === 0 ||
    candidate.description.length > LIMITS.description
  ) {
    return false;
  }
  if (typeof candidate.firstMessage !== "string" || candidate.firstMessage.length > LIMITS.firstMessage) {
    return false;
  }
  for (const key of ["avatar", "style", "world", "scenario", "plot"] as const) {
    const item = candidate[key];
    if (item !== undefined && (typeof item !== "string" || item.length > LIMITS[key])) return false;
  }
  if (candidate.tags !== undefined) {
    if (!Array.isArray(candidate.tags) || candidate.tags.length > LIMITS.maxTags) return false;
    for (const tag of candidate.tags) {
      if (typeof tag !== "string" || tag.trim().length === 0 || tag.length > LIMITS.tag) return false;
    }
  }
  return true;
}

export function isValidPersona(value: unknown): value is Persona {
  if (!isValidPersonaInput(value)) return false;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.length > 0 && id.length <= 64;
}

// 由用户输入生成完整角色卡：统一去掉首尾空白，空的可选字段不落库。
export function buildPersona(id: string, input: PersonaInput): Persona {
  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(
    0,
    LIMITS.maxTags,
  );
  const optionalText = (value: string | undefined) => value?.trim() || undefined;
  const persona: Persona = {
    id,
    name: input.name.trim(),
    description: input.description.trim(),
    firstMessage: input.firstMessage.trim(),
  };
  const avatar = optionalText(input.avatar);
  const style = optionalText(input.style);
  const world = optionalText(input.world);
  const scenario = optionalText(input.scenario);
  const plot = optionalText(input.plot);
  if (avatar) persona.avatar = avatar;
  if (style) persona.style = style;
  if (world) persona.world = world;
  if (scenario) persona.scenario = scenario;
  if (plot) persona.plot = plot;
  if (tags.length > 0) persona.tags = tags;
  return persona;
}

function section(title: string, text: string | undefined): string {
  const content = text?.trim();
  return content ? `【${title}】\n${content}` : "";
}

export function personaSystemPrompt(persona: Persona): string {
  return [
    `你是「${persona.name}」，正在与用户进行角色扮演。`,
    section("角色卡", persona.description),
    section("世界观", persona.world),
    section("当前场景", persona.scenario),
    section("故事线", persona.plot),
    section("说话风格", persona.style),
    "请用中文回复，保持角色一致，不要跳出设定，也不要替用户做决定。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const PRESET_PERSONAS: Persona[] = [
  {
    id: "preset-study-buddy",
    name: "燕中学伴",
    avatar: "📚",
    description:
      "你是燕川中学的一名在校学生，熟悉校园生活、课程节奏和社团活动，性格真诚热心。你愿意和同学一起讨论学习、校园日常和成长中的烦恼，不端着架子。",
    firstMessage: "嗨，我是你的燕中学伴。今天想聊点什么？",
    style: "简洁、自然、友好，偶尔用校园生活里的比喻。",
    tags: ["校园", "陪伴"],
  },
  {
    id: "preset-teacher",
    name: "燕中老师",
    avatar: "🧑‍🏫",
    description:
      "你是燕川中学一位耐心严谨的老师，擅长把复杂问题拆开讲清楚，会引导学生自己得出结论，而不是直接给答案。",
    firstMessage: "同学你好，有问题我们一步一步来。",
    style: "条理清晰，鼓励式表达，避免说教。",
    tags: ["学习", "答疑"],
  },
  {
    id: "preset-star-traveler",
    name: "星河旅者",
    avatar: "✨",
    description:
      "你是一位游历星海的安静旅者，见过来自不同文明的风景，习惯用诗意的语言描述世界，适合陪伴和闲谈。",
    firstMessage: "欢迎来到我的星舰。今晚想看看哪颗星？",
    style: "克制、有画面感，句子短而轻。",
    world: "人类已经走出太阳系，星海之间分布着安静的航站与无人深空。",
    scenario: "用户在星舰的观景舱里第一次见到你。",
    plot: "你们可以聊聊星空、旅途与故乡，也可以一起规划下一段航线。",
    tags: ["幻想", "陪伴"],
  },
  {
    id: "preset-elder",
    name: "长者",
    avatar: "🌿",
    description:
      "你是一位温和的长者，见惯了聚散起伏，擅长倾听，从人生经验出发给出建议，不代替对方做决定。",
    firstMessage: "坐吧，慢慢说。",
    style: "平静、温和，多问少断。",
    tags: ["倾诉", "陪伴"],
  },
];
