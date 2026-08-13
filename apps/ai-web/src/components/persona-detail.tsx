"use client";

import { CalendarClock, Copy, Pencil, Play, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Drawer } from "@/components/drawer";
import { KnowledgeDraftInput } from "@/components/knowledge-draft";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { PersonaForm } from "@/components/persona-form";
import { type Persona, type PersonaInput } from "@/lib/personas";
import type { ConversationSummary, KnowledgeDraft, PersonaKnowledge } from "@/lib/types";
import styles from "./persona-detail.module.css";

type PersonaDetailProps = {
  persona?: Persona;
  mode: "view" | "edit" | "create";
  favorite: boolean;
  recentConversations: ConversationSummary[];
  knowledge: PersonaKnowledge | null;
  knowledgeBusy: boolean;
  onAddKnowledgeText: (name: string, text: string) => Promise<void>;
  onAddKnowledgeFile: (file: File) => Promise<void>;
  onDeleteKnowledgeDocument: (id: string) => Promise<void>;
  busy?: boolean;
  onClose: () => void;
  onStart: (persona: Persona) => void;
  onContinue: (conversationId: string) => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onSave: (input: PersonaInput) => Promise<void>;
  onCreate: (input: PersonaInput, knowledge?: KnowledgeDraft) => Promise<void>;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function PersonaDetail({
  persona,
  mode,
  favorite,
  recentConversations,
  knowledge,
  knowledgeBusy,
  onAddKnowledgeText,
  onAddKnowledgeFile,
  onDeleteKnowledgeDocument,
  busy,
  onClose,
  onStart,
  onContinue,
  onToggleFavorite,
  onEdit,
  onSave,
  onCreate,
  onDelete,
  onDuplicate,
}: PersonaDetailProps) {
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>({ name: "", text: "" });
  const title = mode === "create" ? "新建角色" : mode === "edit" ? `编辑「${persona?.name}」` : persona?.name ?? "角色详情";

  return (
    <Drawer open={Boolean(persona) || mode === "create"} title={title} onClose={onClose}>
      <div className={styles.body}>
        {mode === "view" && persona && (
          <>
            <div className={styles.cover} style={{ background: `var(--cover-${persona.cover ?? "aurora"})` }}>
              <span className={styles.avatar}>{persona.avatar || "🎭"}</span>
            </div>

            <div className={styles.head}>
              <div>
                <h3>{persona.name}</h3>
                {persona.tags && persona.tags.length > 0 && (
                  <div className={styles.tags}>
                    {persona.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className={`${styles.iconButton} ${favorite ? styles.favorite : ""}`}
                type="button"
                onClick={onToggleFavorite}
                title={favorite ? "取消收藏" : "收藏"}
                aria-label={favorite ? "取消收藏" : "收藏"}
              >
                <Star size={18} fill={favorite ? "currentColor" : "none"} />
              </button>
            </div>

            <p className={styles.badge}>角色扮演 · 对话时自动注入角色设定</p>

            <Section title="角色卡" text={persona.description} />
            <Section title="世界观" text={persona.world} />
            <Section title="当前场景" text={persona.scenario} />
            <Section title="故事线" text={persona.plot} />
            <Section title="说话风格" text={persona.style} />
            <Section title="开场白" text={persona.firstMessage} />
            <Section title="示例对话" text={persona.examples} />

            {recentConversations.length > 0 && (
              <section className={styles.section}>
                <h4>最近会话</h4>
                <ul className={styles.recentList}>
                  {recentConversations.slice(0, 5).map((conversation) => (
                    <li key={conversation.id}>
                      <button
                        className={styles.recentItem}
                        type="button"
                        onClick={() => onContinue(conversation.id)}
                      >
                        <CalendarClock size={15} aria-hidden="true" />
                        <span>
                          <strong>{conversation.title || conversation.personaName || "未命名会话"}</strong>
                          <small>
                            {conversation.messageCount} 条 · {new Date(conversation.updatedAt).toLocaleString("zh-CN")}
                          </small>
                        </span>
                        <Play size={15} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {knowledge && (
              <section className={styles.section}>
                <h4>资料库</h4>
                <KnowledgePanel
                  documents={knowledge.documents}
                  chunkCount={knowledge.chunkCount}
                  embeddingModel={knowledge.knowledgeBase?.embeddingModel}
                  busy={knowledgeBusy}
                  emptyText="还没有资料，添加后会在这里显示。"
                  onAddText={onAddKnowledgeText}
                  onAddFile={onAddKnowledgeFile}
                  onDelete={onDeleteKnowledgeDocument}
                />
              </section>
            )}

            <div className={styles.actions}>
              <button className={styles.primary} type="button" onClick={() => onStart(persona)} disabled={busy}>
                <Play size={16} aria-hidden="true" /> 开始对话
              </button>
              <button className={styles.secondary} type="button" onClick={() => onDuplicate()} disabled={busy}>
                <Copy size={15} aria-hidden="true" /> 复制
              </button>
              <button className={styles.secondary} type="button" onClick={onEdit} disabled={busy}>
                <Pencil size={15} aria-hidden="true" /> 编辑
              </button>
              <button className={styles.danger} type="button" onClick={onDelete} disabled={busy}>
                <Trash2 size={15} aria-hidden="true" /> 删除
              </button>
            </div>
          </>
        )}

        {mode === "edit" && persona && (
          <PersonaForm
            initial={persona}
            submitLabel="保存修改"
            busy={busy}
            onCancel={onClose}
            onSubmit={onSave}
          />
        )}

        {mode === "create" && (
          <>
            <PersonaForm
              submitLabel="创建角色"
              busy={busy}
              onCancel={onClose}
              onSubmit={async (input) => onCreate(input, knowledgeDraft)}
            />
            <KnowledgeDraftInput value={knowledgeDraft} onChange={setKnowledgeDraft} />
          </>
        )}
      </div>
    </Drawer>
  );
}

function Section({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null;
  return (
    <section className={styles.section}>
      <h4>{title}</h4>
      <p>{text}</p>
    </section>
  );
}
