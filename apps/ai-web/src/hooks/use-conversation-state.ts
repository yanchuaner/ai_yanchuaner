// 会话状态边界：会话 CRUD、消息、记忆、普通/角色/群聊提交与流式事件。

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { isSessionError, resolveActionError } from "@/lib/action-error-utils";
import {
  ChatActionError,
  requestGroupSchedule,
  streamChatCompletion,
  type ChatRequestMessage,
} from "@/lib/chat-actions";
import {
  appendConversationMessage,
  clearConversationMemory,
  createConversation,
  deleteConversation,
  exportConversation,
  getConversationDetail,
  getConversationMemory,
  listConversations,
  refreshConversationMemory,
  updateConversation,
} from "@/lib/conversation-actions";
import { containsOtherSpeakerSpeech, createSpeakerPrefixStripper } from "@/lib/group-speech";
import { createClientRequestId, createTraceId } from "@/lib/request-ids";
import { personaSystemPrompt, type Persona, type PersonaInput } from "@/lib/personas";
import type { AppView, ChatMessage, ConversationSummary, KnowledgeDraft } from "@/lib/types";
import type { WorldSnapshot } from "@/lib/worlds";
import type { SessionState } from "@/hooks/use-account-state";
import type { DetailState } from "@/hooks/use-persona-state";

type UseConversationStateOptions = {
  abortRef: MutableRefObject<AbortController | null>;
  session: SessionState;
  setView: (view: AppView) => void;
  setSetupOpen: (open: boolean) => void;
  setSetupWorldId: (id: string | null) => void;
  setDetail: (state: DetailState) => void;
  personas: Persona[];
  createLibraryPersona: (input: PersonaInput) => Promise<Persona>;
  uploadInitialKnowledge: (personaId: string, knowledge: KnowledgeDraft) => Promise<void>;
  loadBalance: () => Promise<void>;
  handleSessionExpired: () => void;
  media: {
    pendingImage: string | null;
    setPendingImage: (image: string | null) => void;
    describeImage: (image: string, prompt: string) => Promise<string>;
  };
};

function newMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content };
}

export function useConversationState(options: UseConversationStateOptions) {
  const {
    abortRef,
    session,
    setView,
    setSetupOpen,
    setSetupWorldId,
    setDetail,
    personas,
    createLibraryPersona,
    uploadInitialKnowledge,
    loadBalance,
    handleSessionExpired,
    media,
  } = options;
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activePersona, setActivePersona] = useState<Persona | undefined>();
  const [activeCast, setActiveCast] = useState<Persona[]>([]);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(true);
  const [lastKnowledgeHits, setLastKnowledgeHits] = useState<number | null>(null);
  const [activeMemory, setActiveMemory] = useState<string | null>(null);
  const [memoryState, setMemoryState] = useState<"idle" | "generating" | "error">("idle");
  const [activeWorldTitle, setActiveWorldTitle] = useState<string | null>(null);
  const [activeUserRoleName, setActiveUserRoleName] = useState<string | null>(null);
  const [latestMessageIds, setLatestMessageIds] = useState<Set<string>>(new Set());
  const lastFailedRef = useRef<{ content: string; clientRequestId: string } | null>(null);

  useEffect(() => {
    if (session.status === "anonymous") {
      setConversationId(null);
      setMessages([]);
      setLatestMessageIds(new Set());
      setActiveCast([]);
      setPending(false);
    }
  }, [session.status]);

  function markLatest(...ids: string[]) {
    setLatestMessageIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  async function ensureConversation(): Promise<string | null> {
    if (conversationId) return conversationId;
    try {
      const conversation = await createConversation();
      setConversationId(conversation.id);
      setConversations((current) => [conversation, ...current]);
      return conversation.id;
    } catch {
      return null;
    }
  }

  async function loadConversations() {
    try {
      setConversations(await listConversations());
    } catch (error) {
      resolveActionError(error, handleSessionExpired);
    }
  }

  async function openConversation(id: string) {
    if (!id) return;
    abortRef.current?.abort();
    setView("chat");
    setError("");
    try {
      const detail = await getConversationDetail(id);
      setConversationId(detail.id);
      setMessages(detail.messages);
      setLatestMessageIds(new Set());
      setActivePersona(detail.persona ?? undefined);
      setActiveCast(detail.cast ?? []);
      setActiveWorldTitle(detail.world?.snapshot.title ?? null);
      setActiveUserRoleName(detail.userRole?.name ?? null);
      setLastKnowledgeHits(null);
      void loadMemoryForConversation(id);
    } catch (error) {
      const message = resolveActionError(error, handleSessionExpired);
      if (message) setError(message);
    }
  }

  async function loadMemoryForConversation(id: string) {
    try {
      const memory = await getConversationMemory(id);
      setActiveMemory(memory.summary);
      setMemoryState("idle");
    } catch (error) {
      resolveActionError(error, handleSessionExpired);
    }
  }

  async function triggerMemory(conversationId: string) {
    setMemoryState("generating");
    try {
      const result = await refreshConversationMemory(conversationId);
      if (result.updated && result.summary) setActiveMemory(result.summary);
      setMemoryState("idle");
    } catch (error) {
      resolveActionError(error, handleSessionExpired);
      setMemoryState("error");
    }
  }

  async function clearMemory() {
    if (!conversationId) return;
    try {
      await clearConversationMemory(conversationId);
      setActiveMemory(null);
      setMemoryState("idle");
    } catch (error) {
      resolveActionError(error, handleSessionExpired);
    }
  }

  async function startPlainConversation() {
    const conversation = await createConversation({ mode: "chat" });
    setConversationId(conversation.id);
    setConversations((current) => [conversation, ...current]);
    setMessages([]);
    setLatestMessageIds(new Set());
    setActivePersona(undefined);
    setActiveCast([]);
    setActiveWorldTitle(null);
    setActiveUserRoleName(null);
    setError("");
    setSetupOpen(false);
    setView("chat");
  }

  async function startRoleplayConversation(
    persona: Persona,
    saveToLibrary: boolean,
    knowledge?: KnowledgeDraft,
  ) {
    let target = persona;
    if (saveToLibrary) {
      target = await createLibraryPersona(persona);
    }
    const conversation = await createConversation({ mode: "roleplay", persona: target });
    if (knowledge) {
      try {
        await uploadInitialKnowledge(target.id, knowledge);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "初始资料上传失败。");
      }
    }
    setConversationId(conversation.id);
    setConversations((current) => [conversation, ...current]);
    setMessages([]);
    setLatestMessageIds(new Set());
    setActivePersona(target);
    setActiveCast([]);
    setActiveWorldTitle(null);
    setActiveUserRoleName(null);
    setError("");
    setSetupOpen(false);
    setSetupWorldId(null);
    setDetail({ open: false });
    setView("chat");
  }

  async function startGroupConversation(
    cast: Persona[],
    director?: Persona,
    world?: { worldId: string; snapshot: WorldSnapshot },
    userRole?: { name: string; description: string },
  ) {
    const selectedWorld = world && world.snapshot ? world : undefined;
    const conversation = await createConversation({ mode: "group", cast, director, world: selectedWorld, userRole });
    setConversationId(conversation.id);
    setConversations((current) => [conversation, ...current]);
    setMessages([]);
    setLatestMessageIds(new Set());
    setActivePersona(undefined);
    setActiveCast(cast);
    setActiveWorldTitle(selectedWorld?.snapshot.title ?? null);
    setActiveUserRoleName(userRole?.name ?? null);
    setError("");
    setSetupOpen(false);
    setDetail({ open: false });
    setView("chat");
    void runGroupOpening(conversation.id, cast.map((persona) => persona.name));
  }

  async function runGroupOpening(targetConversationId: string, castNames: string[]) {
    const openingMessages: ChatRequestMessage[] = [{ role: "user", content: "开始群聊" }];
    const traceId = createTraceId();
    try {
      const schedule = await requestGroupSchedule({
        model,
        messages: openingMessages,
        knowledge: false,
        conversationId: targetConversationId,
        opening: true,
        clientRequestId: createClientRequestId(),
        traceId,
      });
      const speakers = schedule.speakers;
      const turnKey = crypto.randomUUID();
      const messageIdBySpeaker = new Map(
        speakers.map((speaker) => [speaker.id, `group-${speaker.id}-${turnKey}`]),
      );
      setMessages((current) => [
        ...current,
        ...speakers.map((speaker) => ({
          id: messageIdBySpeaker.get(speaker.id) as string,
          role: "assistant" as const,
          content: "",
          personaId: speaker.id,
        })),
      ]);
      markLatest(...messageIdBySpeaker.values());
      await Promise.allSettled(
        speakers.map(async (speaker) => {
          const messageId = messageIdBySpeaker.get(speaker.id) as string;
          const prefixStripper = createSpeakerPrefixStripper(speaker.name);
          let content = "";
          try {
            await streamChatCompletion(
              {
                model,
                messages: openingMessages,
                knowledge: false,
                conversationId: targetConversationId,
                speakerId: speaker.id,
                opening: true,
                clientRequestId: createClientRequestId(),
                traceId,
              },
              {
                onDelta: (delta) => {
                  const cleaned = prefixStripper.push(delta);
                  if (cleaned) {
                    content += cleaned;
                    setMessages((current) =>
                      current.map((message) =>
                        message.id === messageId ? { ...message, content: message.content + cleaned } : message,
                      ),
                    );
                  }
                },
              },
            );
          } catch (error) {
            if (isSessionError(error)) handleSessionExpired();
            return;
          }
          if (!content) return;
          if (containsOtherSpeakerSpeech(content, speaker.name, castNames)) {
            setMessages((current) => current.filter((message) => message.id !== messageId));
            return;
          }
          try {
            await appendConversationMessage(targetConversationId, {
              id: messageId,
              role: "assistant",
              content,
              personaId: speaker.id,
              traceId,
            });
          } catch {
            // 开场保存失败不阻断后续会话。
          }
        }),
      );
      await loadBalance();
      await loadConversations();
    } catch (error) {
      if (isSessionError(error)) handleSessionExpired();
      // 开场失败不阻断，用户直接说话即可。
    }
  }

  async function switchToPlain() {
    const recent = conversations.find(
      (conversation) => conversation.mode === "chat" && !conversation.archived,
    );
    if (recent) {
      await openConversation(recent.id);
      return;
    }
    await startPlainConversation();
  }

  async function switchToPersona(persona: Persona) {
    const recent = conversations.find(
      (conversation) => conversation.personaId === persona.id && !conversation.archived,
    );
    if (recent) {
      await openConversation(recent.id);
      return;
    }
    await startRoleplayConversation(persona, false);
  }

  async function updateConversationMeta(
    id: string,
    patch: { title?: string; pinned?: boolean; archived?: boolean },
  ) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              title: patch.title?.trim() || conversation.title,
              pinned: patch.pinned ?? conversation.pinned,
              archived: patch.archived ?? conversation.archived,
            }
          : conversation,
      ),
    );
    try {
      await updateConversation(id, patch);
    } catch (error) {
      resolveActionError(error, handleSessionExpired);
      await loadConversations();
    }
  }

  async function deleteConversationById(id: string) {
    if (!window.confirm("删除该会话？此操作不可恢复。")) return;
    try {
      await deleteConversation(id);
    } catch (error) {
      resolveActionError(error, handleSessionExpired);
      return;
    }
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
      setLatestMessageIds(new Set());
      setActivePersona(undefined);
      setActiveCast([]);
    }
    await loadConversations();
  }

  async function exportConversationById(id: string) {
    try {
      const exported = await exportConversation(id);
      const blob = new Blob([exported.text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exported.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = resolveActionError(error, handleSessionExpired);
      if (message) setError(message);
    }
  }

  function appendAssistantContent(id: string, content: string) {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, content: message.content + content } : message)),
    );
  }

  async function submit() {
    const content = prompt.trim();
    if (!content || pending || session.status !== "authenticated" || !model) return;
    let finalContent = content;
    if (media.pendingImage) {
      try {
        const visionText = await media.describeImage(
          media.pendingImage,
          "结合当前对话，用 100 字以内简要描述这张图片的内容。",
        );
        finalContent = content
          ? `${content}\n\n（用户附带了一张图片：${visionText}）`
          : `（用户发来一张图片：${visionText}）`;
      } catch (reason) {
        const message = resolveActionError(reason, handleSessionExpired);
        setError(message ?? "图片理解失败。");
        return;
      }
    }
    const retry = !media.pendingImage && lastFailedRef.current?.content === content;
    const clientRequestId = retry && lastFailedRef.current ? lastFailedRef.current.clientRequestId : createClientRequestId();
    const traceId = createTraceId();
    if (retry) lastFailedRef.current = null;
    const activeConversation = conversations.find((conversation) => conversation.id === conversationId);
    const activeMode = activeConversation?.mode ?? "chat";
    const userMessage = newMessage("user", finalContent);
    media.setPendingImage(null);
    const assistantMessage = newMessage("assistant", "");
    const targetConversationId = await ensureConversation();
    if (!targetConversationId) {
      setError("会话初始化失败，请刷新后重试。");
      return;
    }
    const systemMessages: { role: "system"; content: string }[] =
      activeMode === "roleplay" && activePersona
        ? [{ role: "system", content: personaSystemPrompt(activePersona) }]
        : [];
    const requestMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      ...systemMessages,
      ...messages,
      userMessage,
    ].map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    if (activeMode === "group" && activeCast.length > 0) {
      setMessages((current) => [...current, userMessage]);
      markLatest(userMessage.id);
      setPrompt("");
      setError("");
      setPending(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await appendConversationMessage(targetConversationId, {
          id: userMessage.id,
          role: "user",
          content: userMessage.content,
        });
        await runGroupTurn(targetConversationId, requestMessages, controller, traceId);
      } catch (reason) {
        const message = resolveActionError(reason, handleSessionExpired);
        if (!controller.signal.aborted && message) {
          setError(message);
          setPrompt(content);
          lastFailedRef.current = { content, clientRequestId };
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setPending(false);
      }
      return;
    }
    setMessages((current) => [...current, userMessage, assistantMessage]);
    markLatest(userMessage.id, assistantMessage.id);
    setPrompt("");
    setError("");
    setPending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await appendConversationMessage(targetConversationId, {
        id: userMessage.id,
        role: "user",
        content: userMessage.content,
      });
      const result = await streamChatCompletion(
        {
          model,
          messages: requestMessages,
          knowledge:
            (activeMode === "roleplay" || activeMode === "group") &&
            Boolean(activePersona || activeCast.length) &&
            knowledgeEnabled,
          conversationId: targetConversationId,
          clientRequestId,
          traceId,
          signal: controller.signal,
        },
        {
          onDelta: (delta) => appendAssistantContent(assistantMessage.id, delta),
        },
      );
      setLastKnowledgeHits(result.knowledgeHits);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                requestId: result.requestId,
                usage: result.usage
                  ? {
                      prompt: result.usage.prompt ?? 0,
                      completion: result.usage.completion ?? 0,
                    }
                  : undefined,
              }
            : message,
        ),
      );
      await appendConversationMessage(targetConversationId, {
        id: assistantMessage.id,
        role: "assistant",
        content: result.content,
        traceId,
        requestId: result.requestId,
        usage: result.usage
          ? {
              prompt: result.usage.prompt ?? 0,
              completion: result.usage.completion ?? 0,
            }
          : undefined,
      });
      await loadBalance();
      await loadConversations();
      const completedCount = messages.length + 2;
      if (activeMode === "roleplay" && completedCount >= 15 && completedCount % 15 === 0) {
        void triggerMemory(targetConversationId);
      }
    } catch (reason) {
      const message = resolveActionError(reason, handleSessionExpired);
      if (!controller.signal.aborted && message) {
        setError(message);
        setPrompt(content);
        lastFailedRef.current = { content, clientRequestId };
      }
      setMessages((current) =>
        current.filter((message) => message.id !== assistantMessage.id || message.content.length > 0),
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
    }
  }

  async function runGroupTurn(
    targetConversationId: string,
    requestMessages: ChatRequestMessage[],
    controller: AbortController,
    traceId: string,
  ) {
    const schedule = await requestGroupSchedule({
      model,
      messages: requestMessages,
      knowledge: Boolean(activeCast.length) && knowledgeEnabled,
      conversationId: targetConversationId,
      clientRequestId: createClientRequestId(),
      traceId,
      signal: controller.signal,
    });
    const speakers = schedule.speakers;
    const turnKey = crypto.randomUUID();
    const messageIdBySpeaker = new Map(speakers.map((speaker) => [speaker.id, `group-${speaker.id}-${turnKey}`]));
    setMessages((current) => [
      ...current,
      ...speakers.map((speaker) => ({
        id: messageIdBySpeaker.get(speaker.id) as string,
        role: "assistant" as const,
        content: "",
        personaId: speaker.id,
      })),
    ]);
    markLatest(...messageIdBySpeaker.values());
    const results = await Promise.allSettled(
      speakers.map(async (speaker) => {
        const messageId = messageIdBySpeaker.get(speaker.id) as string;
        const prefixStripper = createSpeakerPrefixStripper(speaker.name);
        let content = "";
        try {
          const result = await streamChatCompletion(
            {
              model,
              messages: requestMessages,
              knowledge: Boolean(activeCast.length) && knowledgeEnabled,
              conversationId: targetConversationId,
              speakerId: speaker.id,
              clientRequestId: createClientRequestId(),
              traceId,
              signal: controller.signal,
            },
            {
              onDelta: (delta) => {
                const cleaned = prefixStripper.push(delta);
                if (cleaned) {
                  content += cleaned;
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === messageId ? { ...message, content: message.content + cleaned } : message,
                    ),
                  );
                }
              },
            },
          );
          if (!content) throw new ChatActionError("empty", `${speaker.name} 未返回可显示内容。`);
          if (containsOtherSpeakerSpeech(content, speaker.name, activeCast.map((persona) => persona.name))) {
            setMessages((current) =>
              current.filter(
                (message) =>
                  !(message.role === "assistant" && message.personaId === speaker.id && message.id === messageId),
              ),
            );
            return { skipped: true as const, name: speaker.name };
          }
          setMessages((current) =>
            current.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    requestId: result.requestId,
                    usage: result.usage
                      ? {
                          prompt: result.usage.prompt ?? 0,
                          completion: result.usage.completion ?? 0,
                        }
                      : undefined,
                  }
                : message,
            ),
          );
          await appendConversationMessage(targetConversationId, {
            id: messageId,
            role: "assistant",
            content,
            personaId: speaker.id,
            traceId,
            requestId: result.requestId,
            usage: result.usage
              ? {
                  prompt: result.usage.prompt ?? 0,
                  completion: result.usage.completion ?? 0,
                }
              : undefined,
          });
          return { skipped: false as const };
        } catch (error) {
          if (isSessionError(error)) handleSessionExpired();
          throw error;
        }
      }),
    );
    const skipped = results
      .filter((result) => result.status === "fulfilled")
      .map(
        (result) =>
          (result as PromiseFulfilledResult<{ skipped: boolean; name?: string }>).value,
      )
      .filter((value) => value.skipped)
      .map((value) => value.name);
    if (skipped.length > 0) {
      setError(`${skipped.join("、")} 的回复越界替别人说话了，已收起；请以本人回复为准。`);
    }
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      const failedSpeakers = failures.map(
        (failure) => (failure.reason instanceof Error ? failure.reason.message : "发言失败。"),
      );
      setMessages((current) =>
        current.filter(
          (message) =>
            !(
              message.role === "assistant" &&
              message.content === "" &&
              message.personaId &&
              [...messageIdBySpeaker.values()].includes(message.id)
            ),
        ),
      );
      throw new Error(failedSpeakers.join("；"));
    }
    await loadBalance();
    await loadConversations();
    void triggerMemory(targetConversationId);
  }

  return {
    model,
    setModel,
    messages,
    setMessages,
    prompt,
    setPrompt,
    pending,
    setPending,
    error,
    setError,
    conversationId,
    setConversationId,
    conversations,
    setConversations,
    activePersona,
    setActivePersona,
    activeCast,
    setActiveCast,
    knowledgeEnabled,
    setKnowledgeEnabled,
    lastKnowledgeHits,
    setLastKnowledgeHits,
    activeMemory,
    setActiveMemory,
    memoryState,
    setMemoryState,
    activeWorldTitle,
    setActiveWorldTitle,
    activeUserRoleName,
    setActiveUserRoleName,
    latestMessageIds,
    setLatestMessageIds,
    markLatest,
    ensureConversation,
    loadConversations,
    openConversation,
    loadMemoryForConversation,
    triggerMemory,
    clearMemory,
    startPlainConversation,
    startRoleplayConversation,
    startGroupConversation,
    runGroupOpening,
    switchToPlain,
    switchToPersona,
    updateConversationMeta,
    deleteConversationById,
    exportConversationById,
    appendAssistantContent,
    submit,
    runGroupTurn,
  };
}
