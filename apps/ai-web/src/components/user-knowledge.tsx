"use client";

import { Drawer } from "@/components/drawer";
import { KnowledgePanel } from "@/components/knowledge-panel";
import type { PersonaKnowledge } from "@/lib/types";

type UserKnowledgeProps = {
  open: boolean;
  knowledge: PersonaKnowledge | null;
  busy: boolean;
  onClose: () => void;
  onAddText: (name: string, text: string) => Promise<void>;
  onAddFile: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function UserKnowledgeDrawer({
  open,
  knowledge,
  busy,
  onClose,
  onAddText,
  onAddFile,
  onDelete,
}: UserKnowledgeProps) {
  return (
    <Drawer open={open} title="我的资料" onClose={onClose}>
      {knowledge ? (
        <KnowledgePanel
          documents={knowledge.documents}
          chunkCount={knowledge.chunkCount}
          embeddingModel={knowledge.knowledgeBase?.embeddingModel}
          busy={busy}
          emptyText="还没有资料。我的资料会用于所有对话，包括普通助手。"
          onAddText={onAddText}
          onAddFile={onAddFile}
          onDelete={onDelete}
        />
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>正在加载…</p>
      )}
    </Drawer>
  );
}
