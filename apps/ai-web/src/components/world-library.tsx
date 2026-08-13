"use client";

import { Globe, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Drawer } from "@/components/drawer";
import { PRESET_WORLDS } from "@/lib/preset-worlds";
import type { World, WorldInput } from "@/lib/worlds";
import styles from "./world-library.module.css";

type WorldLibraryProps = {
  worlds: World[];
  onSaveWorld: (input: WorldInput, worldId?: string) => Promise<void>;
  onDeleteWorld: (id: string) => Promise<void>;
  onStartGroupFromWorld: (world: World) => void;
};

type FormState = {
  worldId?: string;
  title: string;
  description: string;
  timeline: string;
  outline: string;
};

const emptyForm: FormState = { title: "", description: "", timeline: "", outline: "" };

export function WorldLibrary({ worlds, onSaveWorld, onDeleteWorld, onStartGroupFromWorld }: WorldLibraryProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setForm(emptyForm);
    setError("");
    setEditorOpen(true);
  }

  function openEdit(world: World) {
    setForm({
      worldId: world.id,
      title: world.title,
      description: world.description,
      timeline: world.timeline,
      outline: world.outline,
    });
    setError("");
    setEditorOpen(true);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSaveWorld(
        {
          title: form.title,
          description: form.description,
          timeline: form.timeline,
          outline: form.outline,
        },
        form.worldId,
      );
      setEditorOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存世界观失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>世界库</h1>
          <p>世界观是群聊的剧本：选定世界后，成员会按这个世界的人设和时间线互动。</p>
        </div>
        <button className={styles.create} type="button" onClick={openCreate}>
          <Plus size={16} aria-hidden="true" /> 新建世界观
        </button>
      </header>

      {worlds.length === 0 ? (
        <div className={styles.empty}>
          <Globe size={28} aria-hidden="true" />
          <p>还没有世界观，新建一个，或从“燕川中学”“星际航线”预设开始。</p>
          <button className={styles.create} type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" /> 新建世界观
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {worlds.map((world) => (
            <article className={styles.card} key={world.id}>
              <div className={styles.cardHead}>
                <h2>{world.title}</h2>
                <div className={styles.actions}>
                  <button type="button" onClick={() => openEdit(world)} title="编辑世界观" aria-label="编辑世界观">
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onDeleteWorld(world.id).catch((reason) =>
                        setError(reason instanceof Error ? reason.message : "删除世界观失败。"),
                      )
                    }
                    title="删除世界观"
                    aria-label="删除世界观"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className={styles.description}>{world.description.slice(0, 120)}{world.description.length > 120 ? "…" : ""}</p>
              {world.timeline && <p className={styles.timeline}>时间线：{world.timeline.slice(0, 60)}</p>}
              {world.tags && world.tags.length > 0 && (
                <p className={styles.tags}>{world.tags.join(" · ")}</p>
              )}
              <button
                className={styles.groupButton}
                type="button"
                onClick={() => onStartGroupFromWorld(world)}
              >
                <Users size={14} aria-hidden="true" /> 用这个世界开群聊
              </button>
            </article>
          ))}
        </div>
      )}

      <Drawer open={editorOpen} title={form.worldId ? `编辑「${form.title}」` : "新建世界观"} onClose={() => setEditorOpen(false)}>
        <div className={styles.form}>
          <label>
            <span>标题</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="如：燕川中学"
            />
          </label>
          <label>
            <span>世界观</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="这个世界的基本规则、背景与氛围"
            />
          </label>
          <label>
            <span>时间线</span>
            <input
              type="text"
              value={form.timeline}
              onChange={(event) => setForm({ ...form, timeline: event.target.value })}
              placeholder="如：高三上学期，期中考试前两周"
            />
          </label>
          <label>
            <span>故事大纲</span>
            <textarea
              rows={5}
              value={form.outline}
              onChange={(event) => setForm({ ...form, outline: event.target.value })}
              placeholder="主线走向、关键事件（可选）"
            />
          </label>
          {!form.worldId && (
            <div className={styles.presets}>
              <span>从预设开始：</span>
              {PRESET_WORLDS.map((preset) => (
                <button
                  type="button"
                  key={preset.title}
                  onClick={() =>
                    setForm({
                      ...form,
                      title: preset.title,
                      description: preset.description,
                      timeline: preset.timeline,
                      outline: preset.outline,
                    })
                  }
                >
                  {preset.title}
                </button>
              ))}
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button
            className={styles.save}
            type="button"
            disabled={busy || !form.title.trim() || !form.description.trim()}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : form.worldId ? "保存修改" : "保存世界观"}
          </button>
        </div>
      </Drawer>
    </div>
  );
}
