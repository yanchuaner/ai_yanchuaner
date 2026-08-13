"use client";

import {
  Bot,
  Check,
  Download,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageContent } from "@/components/markdown";
import { type Persona } from "@/lib/personas";
import type { ChatMessage, ChatMode } from "@/lib/types";
import styles from "./chat-stage.module.css";

type ChatStageProps = {
  conversationTitle: string;
  onChangeTitle: (title: string) => void;
  activeMode: ChatMode;
  activePersona?: Persona;
  onOpenPersonaDetail: () => void;
  messages: ChatMessage[];
  quickPersonas: Persona[];
  onQuickSwitch: (persona?: Persona) => void;
  model: string;
  models: string[];
  onModelChange: (model: string) => void;
  balanceUnits: number | null;
  knowledgeEnabled: boolean;
  onKnowledgeChange: (enabled: boolean) => void;
  lastKnowledgeHits: number | null;
  pending: boolean;
  error: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onExport: () => void;
  onDelete: () => void;
  onNewChat: () => void;
  onLogout: () => void;
  onOpenTools: () => void;
};

export function ChatStage({
  conversationTitle,
  onChangeTitle,
  activeMode,
  activePersona,
  onOpenPersonaDetail,
  messages,
  quickPersonas,
  onQuickSwitch,
  model,
  models,
  onModelChange,
  balanceUnits,
  knowledgeEnabled,
  onKnowledgeChange,
  lastKnowledgeHits,
  pending,
  error,
  prompt,
  onPromptChange,
  onSubmit,
  onStop,
  onExport,
  onDelete,
  onNewChat,
  onLogout,
  onOpenTools,
}: ChatStageProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const [contextOpen, setContextOpen] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTitleDraft(conversationTitle);
    setEditingTitle(false);
  }, [conversationTitle, activePersona?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const displayMessages: ChatMessage[] =
    activePersona?.firstMessage?.trim()
      ? [{ id: "persona-greeting", role: "assistant", content: activePersona.firstMessage }, ...messages]
      : messages;

  const totalUsage = messages.reduce(
    (sum, message) =>
      message.usage
        ? { prompt: sum.prompt + message.usage.prompt, completion: sum.completion + message.usage.completion }
        : sum,
    { prompt: 0, completion: 0 },
  );

  function commitTitle() {
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (title && title !== conversationTitle) onChangeTitle(title);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className={styles.stage}>
      <header className={styles.toolbar}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <span className={styles.modeChip}>{activeMode === "roleplay" ? "角色扮演" : "普通助手"}</span>
            {editingTitle ? (
              <input
                className={styles.titleInput}
                type="text"
                maxLength={60}
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitTitle();
                  if (event.key === "Escape") setEditingTitle(false);
                }}
                aria-label="会话标题"
              />
            ) : (
              <button className={styles.titleButton} type="button" onClick={() => setEditingTitle(true)} title="重命名会话">
                <strong>{conversationTitle || "未命名会话"}</strong>
                <Pencil size={13} aria-hidden="true" />
              </button>
            )}
          </div>

          {activePersona ? (
            <button className={styles.personaBar} type="button" onClick={onOpenPersonaDetail} title="查看角色详情">
              <span className={styles.personaAvatar}>{activePersona.avatar || "🎭"}</span>
              <span className={styles.personaCopy}>
                <strong>{activePersona.name}</strong>
                <small>{activePersona.description.slice(0, 42)}{activePersona.description.length > 42 ? "…" : ""}</small>
              </span>
              <Check size={13} aria-hidden="true" />
            </button>
          ) : (
            <span className={styles.plainHint}>正在使用普通助手，直接问答即可。</span>
          )}
        </div>

        <div className={styles.toolbarActions}>
          <label className={styles.modelPicker}>
            <span>模型</span>
            <select value={model} onChange={(event) => onModelChange(event.target.value)} disabled={pending}>
              {models.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.toolButton} type="button" onClick={onOpenTools} title="额度与 Key" aria-label="额度与 Key">
            <ReceiptText size={17} aria-hidden="true" />
          </button>
          <button className={styles.toolButton} type="button" onClick={onExport} title="导出会话" aria-label="导出会话">
            <Download size={17} aria-hidden="true" />
          </button>
          <button className={`${styles.toolButton} ${styles.danger}`} type="button" onClick={onDelete} title="删除会话" aria-label="删除会话">
            <Trash2 size={17} aria-hidden="true" />
          </button>
          <button className={styles.toolButton} type="button" onClick={onNewChat} title="新对话" aria-label="新对话">
            <Plus size={18} aria-hidden="true" />
          </button>
          <button className={styles.toolButton} type="button" onClick={onLogout} title="退出登录" aria-label="退出登录">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.quickRail} aria-label="快速切换">
            <button
              className={`${styles.quickItem} ${!activePersona ? styles.quickActive : ""}`}
              type="button"
              onClick={() => onQuickSwitch(undefined)}
            >
              <span className={styles.quickAvatar}>
                <Bot size={15} aria-hidden="true" />
              </span>
              <span>普通助手</span>
            </button>
            {quickPersonas.slice(0, 7).map((persona) => (
              <button
                key={persona.id}
                className={`${styles.quickItem} ${activePersona?.id === persona.id ? styles.quickActive : ""}`}
                type="button"
                onClick={() => onQuickSwitch(persona)}
                title={persona.name}
              >
                <span className={styles.quickAvatar}>{persona.avatar || "🎭"}</span>
                <span>{persona.name}</span>
              </button>
            ))}
          </div>

          <div className={styles.messages} aria-live="polite">
            {displayMessages.length === 0 && (
              <div className={styles.empty}>
                <span>
                  <Bot size={26} aria-hidden="true" />
                </span>
                <h1>新对话</h1>
                <p>{activePersona ? `与「${activePersona.name}」开始对话` : `当前模型 ${model || "未选择"}`}</p>
              </div>
            )}
            {displayMessages.map((message) => (
              <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`} key={message.id}>
                <span className={styles.messageIcon}>
                  {message.role === "user" ? <User size={16} aria-hidden="true" /> : activePersona?.avatar || <Bot size={16} aria-hidden="true" />}
                </span>
                <div className={styles.messageBody}>
                  {message.content ? (
                    <MessageContent content={message.content} />
                  ) : (
                    <span className={styles.thinking}>正在生成…</span>
                  )}
                  {message.role === "assistant" && (message.requestId || message.usage) && (
                    <small className={styles.meta}>
                      {message.requestId ? `request ${message.requestId}` : ""}
                      {message.usage ? ` · 输入 ${message.usage.prompt} / 输出 ${message.usage.completion}` : ""}
                    </small>
                  )}
                </div>
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <div className={styles.composerWrap}>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <form className={styles.composer} onSubmit={handleSubmit}>
              <textarea
                aria-label="消息"
                placeholder={activePersona ? `对「${activePersona.name}」说点什么…` : "输入消息"}
                rows={2}
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={pending}
              />
              {pending ? (
                <button className={styles.stop} type="button" onClick={onStop} title="停止生成" aria-label="停止生成">
                  <Square size={16} fill="currentColor" aria-hidden="true" />
                </button>
              ) : (
                <button className={styles.send} type="submit" disabled={!prompt.trim() || !model} title="发送" aria-label="发送">
                  <Send size={17} aria-hidden="true" />
                </button>
              )}
            </form>
            <button className={styles.contextToggle} type="button" onClick={() => setContextOpen((open) => !open)}>
              {contextOpen ? "收起上下文" : "展开上下文"}
            </button>
          </div>
        </div>

        {contextOpen && (
          <aside className={styles.context} aria-label="会话上下文">
            <header>
              <strong>会话信息</strong>
              <button type="button" onClick={() => setContextOpen(false)} aria-label="收起上下文">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <section className={styles.contextSection}>
              <h3>额度</h3>
              <p className={styles.balance}>{balanceUnits === null ? "—" : balanceUnits} 单位</p>
            </section>
            <section className={styles.contextSection}>
              <h3>模型</h3>
              <p>{model || "未选择"}</p>
            </section>
            <section className={styles.contextSection}>
              <h3>知识检索</h3>
              <label className={styles.knowledgeToggle}>
                <input
                  type="checkbox"
                  checked={knowledgeEnabled}
                  onChange={(event) => onKnowledgeChange(event.target.checked)}
                />
                <span>{knowledgeEnabled ? "已开启" : "已关闭"}</span>
              </label>
              {lastKnowledgeHits !== null && (
                <p className={styles.knowledgeHits}>上次回答检索到 {lastKnowledgeHits} 个资料片段</p>
              )}
            </section>
            <section className={styles.contextSection}>
              <h3>用量</h3>
              <p>
                输入 {totalUsage.prompt} · 输出 {totalUsage.completion}
              </p>
            </section>
            {activePersona && (
              <section className={styles.contextSection}>
                <h3>角色设定摘要</h3>
                <p>{activePersona.description}</p>
              </section>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
