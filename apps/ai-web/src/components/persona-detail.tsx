"use client";

import { CalendarClock, Copy, FileText, Pencil, Play, Star, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Drawer } from "@/components/drawer";
import { PersonaForm } from "@/components/persona-form";
import { type Persona, type PersonaInput } from "@/lib/personas";
import type { ConversationSummary, PersonaKnowledge } from "@/lib/types";
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
  onCreate: (input: PersonaInput) => Promise<void>;
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
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeName, setKnowledgeName] = useState("");
  const [knowledgeError, setKnowledgeError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const title = mode === "create" ? "新建角色" : mode === "edit" ? `编辑「${persona?.name}」` : persona?.name ?? "角色详情";

  async function submitKnowledge() {
    const text = knowledgeText.trim();
    if (!text) return;
    setKnowledgeError("");
    try {
      await onAddKnowledgeText(knowledgeName.trim() || "粘贴资料", text);
      setKnowledgeText("");
      setKnowledgeName("");
    } catch (reason) {
      setKnowledgeError(reason instanceof Error ? reason.message : "保存资料失败。");
    }
  }

  async function uploadKnowledge(file: File | undefined) {
    if (!file) return;
    setKnowledgeError("");
    try {
      await onAddKnowledgeFile(file);
    } catch (reason) {
      setKnowledgeError(reason instanceof Error ? reason.message : "上传资料失败。");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function confirmDeleteDocument(documentId: string) {
    if (!window.confirm("删除这份资料？对话中将无法再检索到它。")) return;
    void onDeleteKnowledgeDocument(documentId).catch((reason: unknown) => {
      setKnowledgeError(reason instanceof Error ? reason.message : "删除资料失败。");
    });
  }

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
                <p className={styles.hint}>
                  上传剧情、背景与经历，对话时自动检索相关片段。
                  {knowledge.knowledgeBase?.embeddingModel
                    ? ` 当前嵌入模型：${knowledge.knowledgeBase.embeddingModel}`
                    : ""}
                </p>
                <div className={styles.knowledgeToolbar}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown"
                    hidden
                    onChange={(event) => void uploadKnowledge(event.target.files?.[0])}
                  />
                  <button
                    className={styles.fileButton}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={knowledgeBusy}
                  >
                    <Upload size={15} aria-hidden="true" /> 上传文件
                  </button>
                  <span className={styles.fileHint}>txt / Markdown，单份不超过 1 MB</span>
                </div>
                <textarea
                  className={styles.knowledgeTextarea}
                  rows={4}
                  maxLength={200000}
                  value={knowledgeText}
                  onChange={(event) => setKnowledgeText(event.target.value)}
                  placeholder="或直接粘贴剧情、背景、过往经历…"
                />
                <div className={styles.knowledgeActions}>
                  <input
                    className={styles.knowledgeName}
                    type="text"
                    maxLength={80}
                    value={knowledgeName}
                    onChange={(event) => setKnowledgeName(event.target.value)}
                    placeholder="资料名称（可选）"
                  />
                  <button
                    className={styles.addButton}
                    type="button"
                    disabled={!knowledgeText.trim() || knowledgeBusy}
                    onClick={() => void submitKnowledge()}
                  >
                    {knowledgeBusy ? "处理中…" : "添加资料"}
                  </button>
                </div>
                {knowledgeError && (
                  <p className={styles.knowledgeError} role="alert">
                    {knowledgeError}
                  </p>
                )}
                {knowledge.documents.length === 0 ? (
                  <p className={styles.muted}>还没有资料，添加后会在这里显示。</p>
                ) : (
                  <ul className={styles.knowledgeList}>
                    {knowledge.documents.map((document) => (
                      <li key={document.id}>
                        <FileText size={16} aria-hidden="true" />
                        <span>
                          <strong>{document.name}</strong>
                          <small>
                            {document.chunkCount} 个片段 · {document.status === "ready" ? "已就绪" : "异常"}
                          </small>
                        </span>
                        <button
                          className={styles.knowledgeDelete}
                          type="button"
                          onClick={() => confirmDeleteDocument(document.id)}
                          aria-label={`删除资料 ${document.name}`}
                          title="删除资料"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
          <PersonaForm
            submitLabel="创建角色"
            busy={busy}
            onCancel={onClose}
            onSubmit={onCreate}
          />
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
