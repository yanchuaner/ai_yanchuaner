"use client";

import { Plus, Star, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { type Persona } from "@/lib/personas";
import { importPersonaCard } from "@/lib/persona-actions";
import styles from "./persona-library.module.css";

type PersonaLibraryProps = {
  presets: Persona[];
  library: Persona[];
  favoriteIds: string[];
  onOpenDetail: (persona: Persona) => void;
  onNewPersona: () => void;
  onRefreshLibrary: () => Promise<void>;
};

type Filter = "all" | "mine" | "favorites";

export function PersonaLibrary({
  presets,
  library,
  favoriteIds,
  onOpenDetail,
  onNewPersona,
  onRefreshLibrary,
}: PersonaLibraryProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const favoritePresets = presets.filter((persona) => favoriteIds.includes(persona.id));
  const favoriteLibrary = library.filter((persona) => favoriteIds.includes(persona.id));

  const factionGroups = [...new Set(presets.map((persona) => persona.faction).filter(Boolean))].map(
    (faction) => ({
      title: `${faction}阵营`,
      items: presets.filter((persona) => persona.faction === faction),
    }),
  );
  const unfiled = presets.filter((persona) => !persona.faction);
  if (unfiled.length > 0) factionGroups.push({ title: "预设角色", items: unfiled });

  const groups: { title: string; items: Persona[] }[] =
    filter === "all"
      ? [
          ...factionGroups,
          { title: "我的角色", items: library },
        ]
      : filter === "mine"
        ? [{ title: "我的角色", items: library }]
        : [
            { title: "收藏的角色", items: [...favoritePresets, ...favoriteLibrary] },
          ];

  async function importCard(file: File) {
    setImportError("");
    try {
      const text = await file.text();
      const card = JSON.parse(text);
      await importPersonaCard(card);
      await onRefreshLibrary();
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : "导入角色失败。");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>角色库</h1>
          <p>查看角色设定，决定后再开始对话；自定义角色保存在这里。</p>
        </div>
        <button className={styles.create} type="button" onClick={onNewPersona}>
          <Plus size={16} aria-hidden="true" /> 新建角色
        </button>
        <button
          className={styles.create}
          type="button"
          onClick={() => fileRef.current?.click()}
          title="导入 chara_card_v3 角色卡"
        >
          <Upload size={16} aria-hidden="true" /> 导入角色
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importCard(file);
            event.target.value = "";
          }}
        />
      </header>

      {importError && <p className={styles.error}>{importError}</p>}

      <div className={styles.tabs} role="tablist" aria-label="角色筛选">
        {(
          [
            ["all", "全部"],
            ["mine", "我的"],
            ["favorites", "收藏"],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? styles.tabActive : styles.tab}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section className={styles.group} key={group.title}>
              <h2>{group.title}</h2>
              <div className={styles.grid}>
                {group.items.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    favorite={favoriteIds.includes(persona.id)}
                    onOpen={() => onOpenDetail(persona)}
                  />
                ))}
              </div>
            </section>
          ),
      )}

      {groups.every((group) => group.items.length === 0) && (
        <div className={styles.empty}>
          <p>这里还没有角色，新建一个吧。</p>
          <button className={styles.create} type="button" onClick={onNewPersona}>
            <Plus size={16} aria-hidden="true" /> 新建角色
          </button>
        </div>
      )}
    </div>
  );
}

function PersonaCard({
  persona,
  favorite,
  onOpen,
}: {
  persona: Persona;
  favorite: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={styles.card}>
      <button className={styles.cardMain} type="button" onClick={onOpen}>
        <span
          className={styles.cover}
          style={{ background: `var(--cover-${persona.cover ?? "aurora"})` }}
        >
          <span className={styles.avatar}>{persona.avatar || "🎭"}</span>
        </span>
        <span className={styles.copy}>
          <span className={styles.nameRow}>
            <strong>{persona.name}</strong>
            {favorite && <Star size={13} fill="currentColor" aria-label="已收藏" />}
          </span>
          <small>{persona.description}</small>
          {persona.tags && persona.tags.length > 0 && (
            <span className={styles.tags}>{persona.tags.join(" · ")}</span>
          )}
        </span>
      </button>
    </article>
  );
}
