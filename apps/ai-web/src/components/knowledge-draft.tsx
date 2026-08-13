"use client";

import { FileText, Upload } from "lucide-react";
import { useRef } from "react";
import type { KnowledgeDraft } from "@/lib/types";
import styles from "./knowledge-draft.module.css";

type KnowledgeDraftProps = {
  value: KnowledgeDraft;
  onChange: (value: KnowledgeDraft) => void;
};

export function KnowledgeDraftInput({ value, onChange }: KnowledgeDraftProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function pickFile(file: File | undefined) {
    if (!file) return;
    onChange({ ...value, file, name: value.name || file.name });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span>
          <FileText size={15} aria-hidden="true" /> 初始资料（可选）
        </span>
        <small>创建角色后自动上传，对话时即可检索</small>
      </div>
      <textarea
        className={styles.textarea}
        rows={3}
        maxLength={200000}
        value={value.text}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
        placeholder="粘贴剧情、背景、过往经历…"
      />
      <div className={styles.row}>
        <input
          className={styles.nameInput}
          type="text"
          maxLength={80}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="资料名称（可选）"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown"
          hidden
          onChange={(event) => pickFile(event.target.files?.[0])}
        />
        <button className={styles.fileButton} type="button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} aria-hidden="true" /> 选择文件
        </button>
      </div>
      {value.file && <p className={styles.fileName}>已选择：{value.file.name}</p>}
    </div>
  );
}
