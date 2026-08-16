// 前端各组件共享的类型，避免每个组件各自维护一份。

import type { Persona } from "@/lib/personas";

export type ChatMode = "chat" | "roleplay" | "group";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  personaId?: string;
  imageUrl?: string;
  traceId?: string;
  requestId?: string;
  usage?: { prompt: number; completion: number };
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  mode: ChatMode;
  personaName?: string;
  personaId?: string;
  personaIds?: string[];
  pinned?: boolean;
  archived?: boolean;
};

export type ConversationInput = {
  mode?: ChatMode;
  persona?: Persona;
  cast?: Persona[];
  director?: Persona;
  world?: {
    worldId: string;
    snapshot: {
      title: string;
      description: string;
      timeline: string;
      outline: string;
    };
  };
  userRole?: {
    name: string;
    avatar?: string;
    description: string;
    sourcePersonaId?: string;
  };
};

export type ConversationDetail = ConversationInput & {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  messages: ChatMessage[];
};

export type AppView = "home" | "chat" | "personas" | "worlds";

export type PersonaWithMeta = {
  persona: Persona;
  favorite: boolean;
  recentConversationId?: string;
};

export type KnowledgeDocumentSummary = {
  id: string;
  kbId: string;
  name: string;
  source: "paste" | "file";
  status: "ready" | "error";
  error?: string;
  createdAt: number;
  updatedAt: number;
  chunkCount: number;
  tokenCount: number;
};

export type PersonaKnowledge = {
  knowledgeBase: { id: string; name: string; embeddingModel?: string } | null;
  documents: KnowledgeDocumentSummary[];
  chunkCount: number;
};

// 新建角色时可选携带的初始资料，角色创建成功后自动入库。
export type KnowledgeDraft = {
  name: string;
  text: string;
  file?: File;
};
