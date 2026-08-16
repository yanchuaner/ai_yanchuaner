// 角色与知识状态边界：角色库、收藏、角色资料、用户资料。

import { useState } from "react";
import { resolveActionError } from "@/lib/action-error-utils";
import * as knowledgeActions from "@/lib/knowledge-actions";
import * as personaActions from "@/lib/persona-actions";
import { getFavoritePersonaIds, setFavoritePersonaIds } from "@/lib/preferences-actions";
import type { Persona, PersonaInput } from "@/lib/personas";
import type { KnowledgeDraft, PersonaKnowledge } from "@/lib/types";

export type DetailState =
  | { open: false; persona?: undefined; mode?: never }
  | { open: true; persona?: Persona; mode: "view" | "edit" | "create" };

type UsePersonaStateOptions = {
  onUnauthenticated: () => void;
};

export function usePersonaState({ onUnauthenticated }: UsePersonaStateOptions) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<DetailState>({ open: false });
  const [personaKnowledge, setPersonaKnowledge] = useState<PersonaKnowledge | null>(null);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [userKnowledge, setUserKnowledge] = useState<PersonaKnowledge | null>(null);
  const [userKnowledgeOpen, setUserKnowledgeOpen] = useState(false);
  const [userKnowledgeBusy, setUserKnowledgeBusy] = useState(false);

  async function loadPersonas() {
    try {
      setPersonas(await personaActions.listPersonas());
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
    }
  }

  async function loadFavorites() {
    try {
      setFavoriteIds(await getFavoritePersonaIds());
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
    }
  }

  async function loadUserKnowledge() {
    try {
      setUserKnowledge(await knowledgeActions.getUserKnowledge());
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
    }
  }

  async function toggleFavorite(personaId: string) {
    const next = favoriteIds.includes(personaId)
      ? favoriteIds.filter((id) => id !== personaId)
      : [...favoriteIds, personaId];
    setFavoriteIds(next);
    try {
      await setFavoritePersonaIds(next);
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
      setFavoriteIds((current) =>
        current.includes(personaId) ? current.filter((id) => id !== personaId) : [...current, personaId],
      );
    }
  }

  function openUserKnowledgeDrawer() {
    setUserKnowledgeOpen(true);
    void loadUserKnowledge();
  }

  async function addUserKnowledgeText(name: string, text: string) {
    setUserKnowledgeBusy(true);
    try {
      await knowledgeActions.addUserKnowledgeText(name, text);
      await loadUserKnowledge();
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "登录会话已失效，请重新登录。");
    } finally {
      setUserKnowledgeBusy(false);
    }
  }

  async function addUserKnowledgeFile(file: File) {
    setUserKnowledgeBusy(true);
    try {
      await knowledgeActions.addUserKnowledgeFile(file);
      await loadUserKnowledge();
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "登录会话已失效，请重新登录。");
    } finally {
      setUserKnowledgeBusy(false);
    }
  }

  async function deleteUserKnowledgeDocument(documentId: string) {
    try {
      await knowledgeActions.deleteUserKnowledgeDocument(documentId);
      await loadUserKnowledge();
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "删除资料失败。");
    }
  }

  function openPersonaDetail(persona: Persona, mode: "view" | "edit" | "create" = "view") {
    setDetail({ open: true, persona, mode });
    if (mode === "view") void loadPersonaKnowledge(persona.id);
  }

  async function loadPersonaKnowledge(personaId: string) {
    try {
      setPersonaKnowledge(await knowledgeActions.getPersonaKnowledge(personaId));
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
    }
  }

  async function addKnowledgeText(personaId: string, name: string, text: string) {
    setKnowledgeBusy(true);
    try {
      await knowledgeActions.addPersonaKnowledgeText(personaId, name, text);
      await loadPersonaKnowledge(personaId);
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "登录会话已失效，请重新登录。");
    } finally {
      setKnowledgeBusy(false);
    }
  }

  async function addKnowledgeFile(personaId: string, file: File) {
    setKnowledgeBusy(true);
    try {
      await knowledgeActions.addPersonaKnowledgeFile(personaId, file);
      await loadPersonaKnowledge(personaId);
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "登录会话已失效，请重新登录。");
    } finally {
      setKnowledgeBusy(false);
    }
  }

  async function deleteKnowledgeDocument(documentId: string) {
    const personaId = detail.open && detail.persona ? detail.persona.id : "";
    try {
      await knowledgeActions.deletePersonaKnowledgeDocument(personaId, documentId);
      if (personaId) await loadPersonaKnowledge(personaId);
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "删除资料失败。");
    }
  }

  async function uploadInitialKnowledge(personaId: string, knowledge: KnowledgeDraft) {
    if (knowledge.file) await addKnowledgeFile(personaId, knowledge.file);
    if (knowledge.text.trim()) {
      await addKnowledgeText(personaId, knowledge.name.trim() || "初始资料", knowledge.text);
    }
  }

  async function savePersonaEdit(id: string, input: PersonaInput) {
    try {
      const updated = await personaActions.updatePersona(id, input);
      setPersonas((current) => current.map((persona) => (persona.id === id ? updated : persona)));
      setDetail({ open: true, persona: updated, mode: "view" });
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "保存角色失败。");
    }
  }

  async function createLibraryPersona(input: PersonaInput): Promise<Persona> {
    try {
      const persona = await personaActions.createPersona(input);
      setPersonas((current) => [...current, persona]);
      void loadPersonaKnowledge(persona.id);
      return persona;
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "创建角色失败。");
    }
  }

  async function duplicatePersona(persona: Persona) {
    try {
      const created = await personaActions.createPersona({
        name: `${persona.name}（副本）`.slice(0, 32),
        avatar: persona.avatar,
        cover: persona.cover,
        description: persona.description,
        firstMessage: persona.firstMessage,
        style: persona.style,
        world: persona.world,
        scenario: persona.scenario,
        plot: persona.plot,
        examples: persona.examples,
        tags: persona.tags,
      });
      setPersonas((current) => [...current, created]);
      setDetail({ open: true, persona: created, mode: "view" });
      void loadPersonaKnowledge(created.id);
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "复制角色失败。");
    }
  }

  async function deleteLibraryPersona(id: string) {
    if (!window.confirm("删除这个角色？已经开始的会话不受影响。")) return;
    try {
      await personaActions.deletePersona(id);
      await knowledgeActions.deletePersonaKnowledge(id);
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      throw new Error(message ?? "删除角色失败。");
    }
    setPersonas((current) => current.filter((persona) => persona.id !== id));
    setPersonaKnowledge(null);
    setDetail({ open: false });
  }

  return {
    personas,
    setPersonas,
    favoriteIds,
    setFavoriteIds,
    detail,
    setDetail,
    personaKnowledge,
    setPersonaKnowledge,
    knowledgeBusy,
    userKnowledge,
    userKnowledgeOpen,
    setUserKnowledgeOpen,
    userKnowledgeBusy,
    loadPersonas,
    loadFavorites,
    loadUserKnowledge,
    toggleFavorite,
    openUserKnowledgeDrawer,
    addUserKnowledgeText,
    addUserKnowledgeFile,
    deleteUserKnowledgeDocument,
    openPersonaDetail,
    loadPersonaKnowledge,
    addKnowledgeText,
    addKnowledgeFile,
    deleteKnowledgeDocument,
    uploadInitialKnowledge,
    savePersonaEdit,
    createLibraryPersona,
    duplicatePersona,
    deleteLibraryPersona,
  };
}
