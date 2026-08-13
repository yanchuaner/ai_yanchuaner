"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import styles from "./sidebar.module.css";

export type SidebarConversation = {
	id: string;
	title: string;
	updatedAt: number;
	messageCount: number;
};

type ConversationSidebarProps = {
	conversations: SidebarConversation[];
	activeId: string | null;
	open: boolean;
	onClose: () => void;
	onSelect: (id: string) => void;
	onNew: () => void;
	onDelete: (id: string) => void;
	onExport: (id: string) => void;
};

export function ConversationSidebar({
	conversations,
	activeId,
	open,
	onClose,
	onSelect,
	onNew,
	onDelete,
	onExport,
}: ConversationSidebarProps) {
	return (
		<>
			{open && <button className={styles.backdrop} type="button" onClick={onClose} aria-label="关闭会话列表" />}
			<aside className={`${styles.sidebar} ${open ? styles.open : ""}`} aria-label="会话列表">
				<header className={styles.header}>
					<strong>会话</strong>
					<button className={styles.new} type="button" onClick={onNew}>
						<Plus size={15} aria-hidden="true" /> 新对话
					</button>
				</header>
				<ul className={styles.list}>
					{conversations.map((conversation) => (
						<li key={conversation.id}>
							<button
								className={`${styles.item} ${conversation.id === activeId ? styles.active : ""}`}
								type="button"
								onClick={() => onSelect(conversation.id)}
							>
								<span className={styles.title}>{conversation.title || "新对话"}</span>
								<span className={styles.meta}>
									{conversation.messageCount} 条 · {new Date(conversation.updatedAt).toLocaleString("zh-CN")}
								</span>
							</button>
							<div className={styles.actions}>
								<button className={styles.action} type="button" onClick={() => onExport(conversation.id)} aria-label="导出会话">
									<Download size={14} aria-hidden="true" />
								</button>
								<button className={styles.action} type="button" onClick={() => onDelete(conversation.id)} aria-label="删除会话">
									<Trash2 size={14} aria-hidden="true" />
								</button>
							</div>
						</li>
					))}
				</ul>
			</aside>
		</>
	);
}
