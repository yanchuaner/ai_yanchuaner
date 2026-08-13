"use client";

import { FormEvent, useState } from "react";
import { COVER_OPTIONS, isValidPersonaInput, type Persona, type PersonaInput } from "@/lib/personas";
import styles from "./persona-form.module.css";

type PersonaFormProps = {
  initial?: Persona;
  submitLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (input: PersonaInput) => Promise<void>;
};

const EMPTY = {
  name: "",
  avatar: "",
  cover: "aurora",
  description: "",
  firstMessage: "",
  style: "",
  world: "",
  scenario: "",
  plot: "",
  examples: "",
  tags: "",
};

export function PersonaForm({ initial, submitLabel, busy, onCancel, onSubmit }: PersonaFormProps) {
  const [draft, setDraft] = useState(() =>
    initial
      ? {
          name: initial.name,
          avatar: initial.avatar ?? "",
          cover: initial.cover ?? "aurora",
          description: initial.description,
          firstMessage: initial.firstMessage,
          style: initial.style ?? "",
          world: initial.world ?? "",
          scenario: initial.scenario ?? "",
          plot: initial.plot ?? "",
          examples: initial.examples ?? "",
          tags: (initial.tags ?? []).join(", "),
        }
      : EMPTY,
  );
  const [error, setError] = useState("");

  function update(key: keyof typeof EMPTY, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const input: PersonaInput = {
      name: draft.name,
      avatar: draft.avatar,
      cover: draft.cover,
      description: draft.description,
      firstMessage: draft.firstMessage,
      style: draft.style,
      world: draft.world,
      scenario: draft.scenario,
      plot: draft.plot,
      examples: draft.examples,
      tags: draft.tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    if (!isValidPersonaInput(input)) {
      setError("请填写角色名称和角色卡，并检查各项字数限制。");
      return;
    }
    setError("");
    try {
      await onSubmit(input);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>
            角色名称<em>*</em>
          </span>
          <input
            className={styles.input}
            type="text"
            maxLength={32}
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="例如：星河向导"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>头像</span>
          <input
            className={styles.input}
            type="text"
            maxLength={32}
            value={draft.avatar}
            onChange={(event) => update("avatar", event.target.value)}
            placeholder="例如：🦊"
          />
        </label>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>封面</span>
        <div className={styles.covers}>
          {COVER_OPTIONS.map((cover) => (
            <button
              key={cover}
              className={`${styles.cover} ${draft.cover === cover ? styles.coverActive : ""}`}
              type="button"
              onClick={() => update("cover", cover)}
              aria-label={`封面 ${cover}`}
              title={cover}
            >
              <span style={{ background: `var(--cover-${cover})` }} />
            </button>
          ))}
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>
          角色卡<em>*</em>
        </span>
        <textarea
          className={styles.textarea}
          rows={5}
          maxLength={4000}
          value={draft.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder="身份、外貌、性格与经历，决定角色是谁"
          required
        />
        <small className={styles.hint}>身份、外貌、性格与经历，决定角色是谁</small>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>开场白</span>
        <textarea
          className={styles.textarea}
          rows={2}
          maxLength={2000}
          value={draft.firstMessage}
          onChange={(event) => update("firstMessage", event.target.value)}
          placeholder="角色在对话开始时的第一句话"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>说话风格</span>
        <textarea
          className={styles.textarea}
          rows={2}
          maxLength={600}
          value={draft.style}
          onChange={(event) => update("style", event.target.value)}
          placeholder="语气、句式与表达习惯"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>世界观</span>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          value={draft.world}
          onChange={(event) => update("world", event.target.value)}
          placeholder="故事发生的背景与规则"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>当前场景</span>
        <textarea
          className={styles.textarea}
          rows={2}
          maxLength={2000}
          value={draft.scenario}
          onChange={(event) => update("scenario", event.target.value)}
          placeholder="此刻你们在哪里、正在做什么"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>故事线</span>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          value={draft.plot}
          onChange={(event) => update("plot", event.target.value)}
          placeholder="主线剧情或想一起推进的目标"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>示例对话</span>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          value={draft.examples}
          onChange={(event) => update("examples", event.target.value)}
          placeholder="用户：……\n角色：……"
        />
        <small className={styles.hint}>给模型示范语气与回应方式，每行一段对话</small>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>标签</span>
        <input
          className={styles.input}
          type="text"
          maxLength={180}
          value={draft.tags}
          onChange={(event) => update("tags", event.target.value)}
          placeholder="用逗号分隔，例如：科幻, 旅行"
        />
      </label>

      <div className={styles.actions}>
        <button className={styles.cancel} type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button className={styles.submit} type="submit" disabled={busy}>
          {busy ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
