"use client";

import { Bot, Plus, Sparkles, Theater, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PersonaForm } from "@/components/persona-form";
import { KnowledgeDraftInput } from "@/components/knowledge-draft";
import { type Persona } from "@/lib/personas";
import type { KnowledgeDraft } from "@/lib/types";
import styles from "./persona-setup.module.css";

type PersonaSetupProps = {
  open: boolean;
  presets: Persona[];
  library: Persona[];
  onClose: () => void;
  onStartChat: () => Promise<void>;
  onStartRoleplay: (persona: Persona, saveToLibrary: boolean, knowledge?: KnowledgeDraft) => Promise<void>;
  onStartGroup: (cast: Persona[], director?: Persona) => Promise<void>;
  onDeletePersona: (id: string) => Promise<void>;
};

type Step = "mode" | "library" | "editor" | "group";

export function PersonaSetup({
  open,
  presets,
  library,
  onClose,
  onStartChat,
  onStartRoleplay,
  onStartGroup,
  onDeletePersona,
}: PersonaSetupProps) {
  const [step, setStep] = useState<Step>("mode");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>({ name: "", text: "" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [directorId, setDirectorId] = useState("none");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("mode");
      setSaveToLibrary(true);
      setKnowledgeDraft({ name: "", text: "" });
      setSelectedIds([]);
      setDirectorId("none");
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

  function confirmDelete(persona: Persona) {
    if (!window.confirm(`删除角色「${persona.name}」？已经开始的会话不受影响。`)) return;
    void run(() => onDeletePersona(persona.id));
  }

  function togglePersona(personaId: string) {
    setError("");
    setDirectorId((current) => (current === personaId ? "none" : current));
    setSelectedIds((current) => {
      if (current.includes(personaId)) return current.filter((id) => id !== personaId);
      if (current.length >= 4) {
        setError("群聊最多选择 4 个角色。");
        return current;
      }
      return [...current, personaId];
    });
  }

  function selectDirector(personaId: string) {
    setDirectorId(personaId);
    if (personaId !== "none") {
      setSelectedIds((current) => current.filter((id) => id !== personaId));
    }
  }

  async function submitGroup() {
    const all = [...presets, ...library];
    const cast = all.filter((persona) => selectedIds.includes(persona.id));
    if (cast.length < 2) {
      setError("请至少选择 2 个角色。");
      return;
    }
    const director = directorId === "none" ? undefined : all.find((persona) => persona.id === directorId);
    await run(() => onStartGroup(cast, director));
  }

  const heading =
    step === "mode" ? "开始新对话" : step === "library" ? "选择角色" : step === "editor" ? "自定义角色" : "群聊成员";
  const subtitle =
    step === "mode"
      ? "普通助手直接问答；角色扮演可以自定人物、场景与剧情；也可以拉上几位角色一起聊。"
      : step === "library"
        ? "使用预设角色或角色库中的角色，也可以新建自己的角色卡。"
        : step === "editor"
          ? "角色卡越具体，扮演越稳定。"
          : "选择 2 到 4 个角色同台，可选一位主持人营造场景氛围；角色会按剧情单独或同时回应你。";

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
              <small>直接问答、写作整理和日常辅助，保持简洁对话。</small>
            </button>
            <button className={styles.modeCard} type="button" disabled={busy} onClick={() => setStep("library")}>
              <span className={styles.modeIcon}>
                <Theater size={22} aria-hidden="true" />
              </span>
              <strong>角色扮演</strong>
              <small>自定义人物、场景、世界观与剧情，进入沉浸式对话。</small>
            </button>
            <button className={styles.modeCard} type="button" disabled={busy} onClick={() => setStep("group")}>
              <span className={styles.modeIcon}>
                <Users size={22} aria-hidden="true" />
              </span>
              <strong>多人群聊</strong>
              <small>选择 2 到 4 个角色同台，可选主持人营造场景氛围；角色会按剧情单独或同时回应你。</small>
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

        {step === "group" && (
          <div className={styles.library}>
            <section>
              <h3>选择成员（已选 {selectedIds.length} / 4）</h3>
              <div className={styles.cardGrid}>
                {[...presets, ...library].map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    disabled={busy}
                    selectable
                    selected={selectedIds.includes(persona.id)}
                    onSelect={() => togglePersona(persona.id)}
                    onDelete={persona.id.startsWith("custom-") ? () => confirmDelete(persona) : undefined}
                  />
                ))}
              </div>
            </section>
            <section>
              <h3>主持人（可选，只营造氛围，不发言）</h3>
              <select
                className={styles.directorSelect}
                value={directorId}
                onChange={(event) => selectDirector(event.target.value)}
                disabled={busy}
              >
                <option value="none">无主持人</option>
                {[...presets, ...library]
                  .map((persona) => (
                    <option value={persona.id} key={persona.id}>
                      {persona.name}
                    </option>
                  ))}
              </select>
              <div className={styles.groupActions}>
                <button className={styles.backButton} type="button" onClick={() => setStep("mode")} disabled={busy}>
                  返回
                </button>
                <button className={styles.submitButton} type="button" onClick={() => void submitGroup()} disabled={busy}>
                  <Sparkles size={16} aria-hidden="true" /> 开始群聊
                </button>
              </div>
            </section>
          </div>
        )}

        {step === "editor" && (
          <div className={styles.editor}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={saveToLibrary}
                onChange={(event) => setSaveToLibrary(event.target.checked)}
              />
              <span>保存到我的角色库，方便以后复用</span>
            </label>
            <PersonaForm
              submitLabel="开始对话"
              busy={busy}
              onCancel={() => setStep("library")}
              onSubmit={async (input) => {
                await run(() =>
                  onStartRoleplay(
                    { id: `local-${crypto.randomUUID()}`, ...input },
                    saveToLibrary,
                    knowledgeDraft,
                  ),
                );
              }}
            />
            <KnowledgeDraftInput value={knowledgeDraft} onChange={setKnowledgeDraft} />
          </div>
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
  selectable,
  selected,
}: {
  persona: Persona;
  disabled: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  return (
    <article className={`${styles.personaCard} ${selected ? styles.personaSelected : ""}`}>
      <button className={styles.personaMain} type="button" disabled={disabled} onClick={onSelect}>
        {selectable && (
          <span className={`${styles.checkMark} ${selected ? styles.checkMarkOn : ""}`}>
            {selected && "✓"}
          </span>
        )}
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
