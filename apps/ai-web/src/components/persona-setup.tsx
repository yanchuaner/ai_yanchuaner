"use client";

import { Bot, ChevronLeft, Plus, Sparkles, Theater, Trash2, X } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { isValidPersonaInput, type Persona } from "@/lib/personas";
import styles from "./persona-setup.module.css";

type PersonaSetupProps = {
  open: boolean;
  presets: Persona[];
  library: Persona[];
  onClose: () => void;
  onStartChat: () => Promise<void>;
  onStartRoleplay: (persona: Persona, saveToLibrary: boolean) => Promise<void>;
  onDeletePersona: (id: string) => Promise<void>;
};

type Draft = {
  name: string;
  avatar: string;
  description: string;
  firstMessage: string;
  style: string;
  world: string;
  scenario: string;
  plot: string;
  tags: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  avatar: "",
  description: "",
  firstMessage: "",
  style: "",
  world: "",
  scenario: "",
  plot: "",
  tags: "",
};

export function PersonaSetup({
  open,
  presets,
  library,
  onClose,
  onStartChat,
  onStartRoleplay,
  onDeletePersona,
}: PersonaSetupProps) {
  const [step, setStep] = useState<"mode" | "library" | "editor">("mode");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("mode");
      setDraft(EMPTY_DRAFT);
      setSaveToLibrary(true);
      setError("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  function updateDraft(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function submitEditor(event: FormEvent) {
    event.preventDefault();
    const input = {
      name: draft.name,
      avatar: draft.avatar,
      description: draft.description,
      firstMessage: draft.firstMessage,
      style: draft.style,
      world: draft.world,
      scenario: draft.scenario,
      plot: draft.plot,
      tags: draft.tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    if (!isValidPersonaInput(input)) {
      setError("请填写角色名称和角色卡，并检查各项字数限制。");
      return;
    }
    void run(() => onStartRoleplay({ id: `local-${crypto.randomUUID()}`, ...input }, saveToLibrary));
  }

  function confirmDelete(persona: Persona) {
    if (!window.confirm(`删除角色「${persona.name}」？已经开始的会话不受影响。`)) return;
    void run(() => onDeletePersona(persona.id));
  }

  const heading =
    step === "mode" ? "开始新对话" : step === "library" ? "选择角色" : "自定义角色";
  const subtitle =
    step === "mode"
      ? "普通助手直接问答；角色扮演可以自定人物、场景与剧情。"
      : step === "library"
        ? "使用预设角色或角色库中的角色，也可以新建自己的角色卡。"
        : "角色卡越具体，扮演越稳定。填写完保存并开始对话。";

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="新对话设置">
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2>{heading}</h2>
            <p>{subtitle}</p>
          </div>
          <button className={styles.close} type="button" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {step === "mode" && (
          <div className={styles.modeGrid}>
            <button className={styles.modeCard} type="button" disabled={busy} onClick={() => void run(onStartChat)}>
              <span className={styles.modeIcon}>
                <Bot size={22} aria-hidden="true" />
              </span>
              <strong>普通助手</strong>
              <small>直接问答、写作整理和日常辅助，保持现有的简洁对话。</small>
            </button>
            <button className={styles.modeCard} type="button" disabled={busy} onClick={() => setStep("library")}>
              <span className={styles.modeIcon}>
                <Theater size={22} aria-hidden="true" />
              </span>
              <strong>角色扮演</strong>
              <small>自定义人物、场景、世界观与剧情，进入沉浸式对话。</small>
            </button>
          </div>
        )}

        {step === "library" && (
          <div className={styles.library}>
            <section>
              <h3>预设角色</h3>
              <div className={styles.cardGrid}>
                {presets.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    disabled={busy}
                    onSelect={() => void run(() => onStartRoleplay(persona, false))}
                  />
                ))}
              </div>
            </section>

            <section>
              <h3>我的角色</h3>
              {library.length === 0 ? (
                <p className={styles.muted}>还没有自定义角色，可以先创建一个。</p>
              ) : (
                <div className={styles.cardGrid}>
                  {library.map((persona) => (
                    <PersonaCard
                      key={persona.id}
                      persona={persona}
                      disabled={busy}
                      onSelect={() => void run(() => onStartRoleplay(persona, false))}
                      onDelete={() => confirmDelete(persona)}
                    />
                  ))}
                </div>
              )}
              <button className={styles.createButton} type="button" disabled={busy} onClick={() => setStep("editor")}>
                <Plus size={16} aria-hidden="true" /> 新建自定义角色
              </button>
            </section>
          </div>
        )}

        {step === "editor" && (
          <form className={styles.form} onSubmit={submitEditor}>
            <Field label="角色名称" required>
              <input
                className={styles.input}
                type="text"
                maxLength={32}
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="例如：星河向导"
                required
              />
            </Field>
            <Field label="头像" hint="可选，建议一个表情符号">
              <input
                className={styles.input}
                type="text"
                maxLength={32}
                value={draft.avatar}
                onChange={(event) => updateDraft("avatar", event.target.value)}
                placeholder="例如：🦊"
              />
            </Field>
            <Field label="角色卡" required hint="身份、外貌、性格与经历，决定角色是谁">
              <textarea
                className={styles.textarea}
                rows={5}
                maxLength={4000}
                value={draft.description}
                onChange={(event) => updateDraft("description", event.target.value)}
                placeholder="一位冷静的向导，熟悉航线与旧地图……"
                required
              />
            </Field>
            <Field label="开场白" hint="角色在对话开始时的第一句话">
              <textarea
                className={styles.textarea}
                rows={3}
                maxLength={2000}
                value={draft.firstMessage}
                onChange={(event) => updateDraft("firstMessage", event.target.value)}
                placeholder="欢迎登船。"
              />
            </Field>
            <Field label="说话风格" hint="语气、句式与表达习惯">
              <textarea
                className={styles.textarea}
                rows={2}
                maxLength={600}
                value={draft.style}
                onChange={(event) => updateDraft("style", event.target.value)}
                placeholder="平静、简短，偶尔带一点旧式航海比喻"
              />
            </Field>
            <Field label="世界观" hint="故事发生的背景与规则">
              <textarea
                className={styles.textarea}
                rows={3}
                maxLength={4000}
                value={draft.world}
                onChange={(event) => updateDraft("world", event.target.value)}
                placeholder="人类已经走出太阳系，星海之间有安静的航站……"
              />
            </Field>
            <Field label="当前场景" hint="此刻你们在哪里、正在做什么">
              <textarea
                className={styles.textarea}
                rows={3}
                maxLength={2000}
                value={draft.scenario}
                onChange={(event) => updateDraft("scenario", event.target.value)}
                placeholder="在星舰观景舱里第一次见面"
              />
            </Field>
            <Field label="故事线" hint="主线剧情或想一起推进的目标">
              <textarea
                className={styles.textarea}
                rows={3}
                maxLength={4000}
                value={draft.plot}
                onChange={(event) => updateDraft("plot", event.target.value)}
                placeholder="一起寻找失落星图，途中经过三个星站"
              />
            </Field>
            <Field label="标签" hint="用逗号分隔，便于以后查找">
              <input
                className={styles.input}
                type="text"
                maxLength={180}
                value={draft.tags}
                onChange={(event) => updateDraft("tags", event.target.value)}
                placeholder="科幻, 旅行"
              />
            </Field>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={saveToLibrary}
                onChange={(event) => setSaveToLibrary(event.target.checked)}
              />
              <span>保存到我的角色库，方便以后复用</span>
            </label>
            <div className={styles.actions}>
              <button className={styles.backButton} type="button" onClick={() => setStep("library")} disabled={busy}>
                <ChevronLeft size={16} aria-hidden="true" /> 返回
              </button>
              <button className={styles.submitButton} type="submit" disabled={busy}>
                <Sparkles size={16} aria-hidden="true" /> 开始对话
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function PersonaCard({
  persona,
  disabled,
  onSelect,
  onDelete,
}: {
  persona: Persona;
  disabled: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className={styles.personaCard}>
      <button className={styles.personaMain} type="button" disabled={disabled} onClick={onSelect}>
        <span className={styles.avatar}>{persona.avatar || "🎭"}</span>
        <span className={styles.personaCopy}>
          <strong>{persona.name}</strong>
          <small>{persona.description}</small>
          {persona.tags && persona.tags.length > 0 && <span className={styles.tags}>{persona.tags.join(" · ")}</span>}
        </span>
      </button>
      {onDelete && (
        <button
          className={styles.deleteButton}
          type="button"
          disabled={disabled}
          onClick={onDelete}
          aria-label={`删除角色 ${persona.name}`}
          title="删除角色"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </article>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {required && <em>*</em>}
      </span>
      {children}
      {hint && <small className={styles.hint}>{hint}</small>}
    </label>
  );
}
