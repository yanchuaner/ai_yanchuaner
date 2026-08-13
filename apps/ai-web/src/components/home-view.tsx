"use client";

import { ArrowRight, Bot, Coins, FileText, Plus, Sparkles, Star, Users } from "lucide-react";
import { type Persona } from "@/lib/personas";
import type { ConversationSummary, KnowledgeDocumentSummary } from "@/lib/types";
import styles from "./home-view.module.css";

type HomeViewProps = {
  identityName: string;
  balanceUnits: number | null;
  model: string;
  recentConversations: ConversationSummary[];
  presets: Persona[];
  library: Persona[];
  favoriteIds: string[];
  userKnowledge: { documents: KnowledgeDocumentSummary[]; chunkCount: number } | null;
  onOpenUserKnowledge: () => void;
  onOpenConversation: (id: string) => void;
  onOpenChat: () => void;
  onNewChat: () => void;
  onOpenLibrary: () => void;
  onOpenTools: () => void;
  onOpenPersona: (persona: Persona) => void;
};

export function HomeView({
  identityName,
  balanceUnits,
  model,
  recentConversations,
  presets,
  library,
  favoriteIds,
  userKnowledge,
  onOpenUserKnowledge,
  onOpenConversation,
  onOpenChat,
  onNewChat,
  onOpenLibrary,
  onOpenTools,
  onOpenPersona,
}: HomeViewProps) {
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const favorites = [...library, ...presets].filter((persona) => favoriteIds.includes(persona.id));
  const gallery = [...favorites, ...presets.filter((persona) => !favoriteIds.includes(persona.id))].slice(0, 6);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>YANCHUANER AI</p>
          <h1>{greeting}，{identityName}</h1>
          <p className={styles.subtitle}>普通助手随时可用，想换种聊法就进入角色世界。</p>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.primary} type="button" onClick={onNewChat}>
            <Plus size={16} aria-hidden="true" /> 新对话
          </button>
          <button className={styles.secondary} type="button" onClick={onOpenLibrary}>
            <Users size={16} aria-hidden="true" /> 角色库
          </button>
        </div>
      </section>

      <section className={styles.cards}>
        <button className={styles.balanceCard} type="button" onClick={onOpenTools}>
          <span className={styles.cardIcon}>
            <Coins size={20} aria-hidden="true" />
          </span>
          <span>
            <small>公益额度</small>
            <strong>{balanceUnits === null ? "—" : balanceUnits}</strong>
            <em>点击查看流水与 API Key</em>
          </span>
        </button>
        <div className={styles.modelCard}>
          <span className={styles.cardIcon}>
            <Bot size={20} aria-hidden="true" />
          </span>
          <span>
            <small>当前模型</small>
            <strong>{model || "—"}</strong>
            <em>进入对话后可切换</em>
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>我的资料</h2>
          <button className={styles.textAction} type="button" onClick={onOpenUserKnowledge}>
            管理资料 <ArrowRight size={14} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.knowledgeRow}>
          <span className={styles.knowledgeIcon}>
            <FileText size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>{userKnowledge ? `${userKnowledge.documents.length} 份资料 · ${userKnowledge.chunkCount} 个片段` : "暂无资料"}</strong>
            <small>剧情、背景与经历放在这里，所有对话都会自动检索。</small>
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>最近会话</h2>
          {recentConversations.length > 0 && (
            <button className={styles.textAction} type="button" onClick={onOpenChat}>
              查看全部 <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </header>
        {recentConversations.length === 0 ? (
          <p className={styles.muted}>还没有会话，开始一段对话吧。</p>
        ) : (
          <ul className={styles.conversationList}>
            {recentConversations.slice(0, 5).map((conversation) => (
              <li key={conversation.id}>
                <button className={styles.conversationItem} type="button" onClick={() => onOpenConversation(conversation.id)}>
                  <span className={conversation.mode === "roleplay" ? styles.itemIconRoleplay : styles.itemIcon}>
                    {conversation.mode === "roleplay" ? "🎭" : <Bot size={15} aria-hidden="true" />}
                  </span>
                  <span>
                    <strong>{conversation.title || conversation.personaName || "未命名会话"}</strong>
                    <small>{conversation.messageCount} 条 · {new Date(conversation.updatedAt).toLocaleString("zh-CN")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>角色画廊</h2>
          <button className={styles.textAction} type="button" onClick={onOpenLibrary}>
            进入角色库 <ArrowRight size={14} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.gallery}>
          {gallery.map((persona) => (
            <button
              key={persona.id}
              className={styles.galleryCard}
              type="button"
              onClick={() => onOpenPersona(persona)}
            >
              <span className={styles.galleryCover} style={{ background: `var(--cover-${persona.cover ?? "aurora"})` }}>
                <span>{persona.avatar || "🎭"}</span>
              </span>
              <span className={styles.galleryCopy}>
                <strong>{persona.name}</strong>
                {favoriteIds.includes(persona.id) && <Star size={12} fill="currentColor" aria-label="已收藏" />}
              </span>
            </button>
          ))}
        </div>
      </section>

      <button className={styles.quickHint} type="button" onClick={onOpenTools}>
        <Sparkles size={15} aria-hidden="true" /> 额度、API Key 与流水在右侧工具抽屉里
      </button>
    </div>
  );
}
