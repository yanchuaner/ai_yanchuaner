"use client";

import {
  Archive,
  ArchiveRestore,
  Download,
  Globe,
  LayoutGrid,
  MessagesSquare,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { type Persona } from "@/lib/personas";
import type { AppView, ConversationSummary } from "@/lib/types";
import styles from "./sidebar.module.css";

type SidebarProps = {
  view: AppView;
  onNavigate: (view: AppView) => void;
  conversations: ConversationSummary[];
  personas: Persona[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenWorlds: () => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onUpdate: (id: string, patch: { title?: string; pinned?: boolean; archived?: boolean }) => void;
};

type Scope = "active" | "archived";

export function ConversationSidebar({
  view,
  onNavigate,
  conversations,
  personas,
  activeId,
  open,
  onClose,
  onSelect,
  onNew,
  onOpenWorlds,
  onDelete,
  onExport,
  onUpdate,
}: SidebarProps) {
  const [scope, setScope] = useState<Scope>("active");
  const [personaFilter, setPersonaFilter] = useState("all");

  const items = conversations.filter((conversation) =>
    scope === "archived" ? conversation.archived : !conversation.archived,
  );
  const visible =
    personaFilter === "all" ? items : items.filter((item) => item.personaIds?.includes(personaFilter));

  return (
    <>
      {open && <button className={styles.backdrop} type="button" onClick={onClose} aria-label="关闭侧栏" />}
      <aside className={`${styles.sidebar} ${open ? styles.open : ""}`} aria-label="导航与会话">
        <nav className={styles.nav} aria-label="主菜单">
          <button
            className={view === "home" ? styles.navActive : styles.navItem}
            type="button"
            onClick={() => onNavigate("home")}
          >
            <LayoutGrid size={16} aria-hidden="true" /> 工作台
          </button>
          <button
            className={view === "chat" ? styles.navActive : styles.navItem}
            type="button"
            onClick={() => onNavigate("chat")}
          >
            <MessagesSquare size={16} aria-hidden="true" /> 聊天
          </button>
          <button
            className={view === "personas" ? styles.navActive : styles.navItem}
            type="button"
            onClick={() => onNavigate("personas")}
          >
            <Users size={16} aria-hidden="true" /> 角色库
          </button>
          <button
            className={styles.navItem}
            type="button"
            onClick={onOpenWorlds}
            title="故事世界管理"
          >
            <Globe size={16} aria-hidden="true" /> 世界库
          </button>
        </nav>

        <header className={styles.header}>
          <strong>会话</strong>
          <button className={styles.new} type="button" onClick={onNew}>
            <Plus size={15} aria-hidden="true" /> 新对话
          </button>
        </header>

        <div className={styles.filters}>
          <div className={styles.scopeTabs}>
            <button
              className={scope === "active" ? styles.scopeActive : styles.scope}
              type="button"
              onClick={() => setScope("active")}
            >
              全部
            </button>
            <button
              className={scope === "archived" ? styles.scopeActive : styles.scope}
              type="button"
              onClick={() => setScope("archived")}
            >
              已归档
            </button>
          </div>
          <select
            className={styles.personaSelect}
            value={personaFilter}
            onChange={(event) => setPersonaFilter(event.target.value)}
            aria-label="按角色筛选会话"
          >
            <option value="all">全部角色</option>
            <option value="plain">普通助手</option>
            {personas.map((persona) => (
              <option value={persona.id} key={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
        </div>

        <ul className={styles.list}>
          {visible.map((conversation) => (
            <li key={conversation.id}>
              <button
                className={`${styles.item} ${conversation.id === activeId ? styles.active : ""}`}
                type="button"
                onClick={() => onSelect(conversation.id)}
              >
                <span className={styles.title}>
                  {conversation.mode !== "chat" && <em className={styles.roleIcon}>🎭</em>}
                  <span>{conversation.title || conversation.personaName || "未命名会话"}</span>
                </span>
                <span className={styles.meta}>
                  {conversation.pinned && <span className={styles.pinMark}>置顶</span>}
                  {conversation.messageCount} 条 · {new Date(conversation.updatedAt).toLocaleString("zh-CN")}
                </span>
              </button>
              <div className={styles.actions}>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() => onUpdate(conversation.id, { pinned: !conversation.pinned })}
                  aria-label={conversation.pinned ? "取消置顶" : "置顶"}
                  title={conversation.pinned ? "取消置顶" : "置顶"}
                >
                  {conversation.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
                </button>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() => onUpdate(conversation.id, { archived: !conversation.archived })}
                  aria-label={conversation.archived ? "取消归档" : "归档"}
                  title={conversation.archived ? "取消归档" : "归档"}
                >
                  {conversation.archived ? (
                    <ArchiveRestore size={14} aria-hidden="true" />
                  ) : (
                    <Archive size={14} aria-hidden="true" />
                  )}
                </button>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() => onExport(conversation.id)}
                  aria-label="导出会话"
                  title="导出会话"
                >
                  <Download size={14} aria-hidden="true" />
                </button>
                <button
                  className={`${styles.action} ${styles.danger}`}
                  type="button"
                  onClick={() => onDelete(conversation.id)}
                  aria-label="删除会话"
                  title="删除会话"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {visible.length === 0 && (
          <p className={styles.empty}>暂无{scope === "archived" ? "已归档" : ""}会话</p>
        )}
      </aside>
    </>
  );
}
