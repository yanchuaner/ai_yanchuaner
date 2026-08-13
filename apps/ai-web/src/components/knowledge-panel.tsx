"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { KnowledgeDocumentSummary } from "@/lib/types";
import styles from "./knowledge-panel.module.css";

type KnowledgePanelProps = {
  documents: KnowledgeDocumentSummary[];
  chunkCount: number;
  embeddingModel?: string;
  busy: boolean;
  emptyText?: string;
  onAddText: (name: string, text: string) => Promise<void>;
  onAddFile: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function KnowledgePanel({
  documents,
  chunkCount,
  embeddingModel,
  busy,
  emptyText,
  onAddText,
  onAddFile,
  onDelete,
}: KnowledgePanelProps) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function submitText() {
    const content = text.trim();
    if (!content) return;
    setError("");
    try {
      await onAddText(name.trim() || "粘贴资料", content);
      setText("");
      setName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存资料失败。");
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      await onAddFile(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "上传资料失败。");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function confirmDelete(documentId: string) {
    if (!window.confirm("删除这份资料？对话中将无法再检索到它。")) return;
    void onDelete(documentId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "删除资料失败。");
    });
  }

  return (
    <div className={styles.panel}>
      <p className={styles.hint}>
        上传剧情、背景与经历，对话时自动检索相关片段，共 {chunkCount} 个片段。
        {embeddingModel ? ` 当前嵌入模型：${embeddingModel}` : ""}
      </p>
      <div className={styles.toolbar}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown"
          hidden
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <button className={styles.fileButton} type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          <Upload size={15} aria-hidden="true" /> 上传文件
        </button>
        <span className={styles.fileHint}>txt / Markdown，单份不超过 1 MB</span>
      </div>
      <textarea
        className={styles.textarea}
        rows={4}
        maxLength={200000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="或直接粘贴剧情、背景、过往经历…"
      />
      <div className={styles.actions}>
        <input
          className={styles.nameInput}
          type="text"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="资料名称（可选）"
        />
        <button
          className={styles.addButton}
          type="button"
          disabled={!text.trim() || busy}
          onClick={() => void submitText()}
        >
          {busy ? "处理中…" : "添加资料"}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {documents.length === 0 ? (
        <p className={styles.muted}>{emptyText ?? "还没有资料，添加后会在这里显示。"}</p>
      ) : (
        <ul className={styles.list}>
          {documents.map((document) => (
            <li key={document.id}>
              <FileText size={16} aria-hidden="true" />
              <span>
                <strong>{document.name}</strong>
                <small>
                  {document.chunkCount} 个片段 · {document.status === "ready" ? "已就绪" : "异常"}
                </small>
              </span>
              <button
                className={styles.delete}
                type="button"
                onClick={() => confirmDelete(document.id)}
                aria-label={`删除资料 ${document.name}`}
                title="删除资料"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
