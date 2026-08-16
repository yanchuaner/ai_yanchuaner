"use client";

import {
  Coins,
  KeyRound,
  LogIn,
  Mic,
  Palette,
  PanelLeft,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatStage } from "@/components/chat-stage";
import { Drawer } from "@/components/drawer";
import { GuideDrawer } from "@/components/guide-drawer";
import { HomeView } from "@/components/home-view";
import { PersonaDetail } from "@/components/persona-detail";
import { PersonaLibrary } from "@/components/persona-library";
import { PersonaSetup } from "@/components/persona-setup";
import { ConversationSidebar } from "@/components/sidebar";
import { UserKnowledgeDrawer } from "@/components/user-knowledge";
import { WorldLibrary } from "@/components/world-library";
import { personaSystemPrompt, PRESET_PERSONAS, type Persona, type PersonaInput } from "@/lib/personas";
import { containsOtherSpeakerSpeech, createSpeakerPrefixStripper } from "@/lib/group-speech";
import { createClientRequestId, createTraceId } from "@/lib/request-ids";
import type { World, WorldInput, WorldSnapshot } from "@/lib/worlds";
import type {
  AppView,
  ChatMessage,
  ConversationSummary,
  KnowledgeDraft,
  PersonaKnowledge,
} from "@/lib/types";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | {
      status: "authenticated";
      identity: { name: string; role: string };
      subject: { userId: number; scopes: string; audience: string };
      models: string[];
      sessionQuotaUnits: number;
      expiresAt: number;
    };

type LedgerEntry = {
  id: number;
  entry_type: string;
  funding_source: string;
  amount: number;
  balance_after: number;
  reason: string;
  request_id: string;
  created_at: number;
};

type ApiKeyItem = {
  id: number;
  name: string;
  key: string;
  status: number;
  model_limits_enabled: boolean;
  model_limits: string;
  remain_quota: number;
  unlimited_quota: boolean;
  expired_time: number;
  created_time: number;
};

type VoiceSettingsView = {
  asr: { baseUrl: string; model: string } | null;
  tts: { baseUrl: string; model: string; voice?: string } | null;
  updatedAt: number;
};

type DetailState =
  | { open: false; persona?: undefined; mode?: never }
  | { open: true; persona?: Persona; mode: "view" | "edit" | "create" };

function newMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content };
}

export default function HomePage() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [balanceUnits, setBalanceUnits] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [view, setView] = useState<AppView>("home");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersona, setActivePersona] = useState<Persona | undefined>();
  const [activeCast, setActiveCast] = useState<Persona[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<DetailState>({ open: false });
  const [personaKnowledge, setPersonaKnowledge] = useState<PersonaKnowledge | null>(null);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(true);
  const [lastKnowledgeHits, setLastKnowledgeHits] = useState<number | null>(null);
  const [userKnowledge, setUserKnowledge] = useState<PersonaKnowledge | null>(null);
  const [userKnowledgeOpen, setUserKnowledgeOpen] = useState(false);
  const [userKnowledgeBusy, setUserKnowledgeBusy] = useState(false);
  const [activeMemory, setActiveMemory] = useState<string | null>(null);
  const [memoryState, setMemoryState] = useState<"idle" | "generating" | "error">("idle");
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [quotaForm, setQuotaForm] = useState({ userId: "", action: "grant", amount: "", reason: "", reference: "" });
  const [quotaResult, setQuotaResult] = useState("");
  const [quotaError, setQuotaError] = useState("");
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [keyForm, setKeyForm] = useState({ name: "", models: ["deepseek-v4-flash"], remainQuota: "100000", expiryDays: "30" });
  const [createdKey, setCreatedKey] = useState("");
  const [keysError, setKeysError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<"ledger" | "keys" | "quota" | "voice" | "media">("ledger");
  const [worlds, setWorlds] = useState<World[]>([]);
  const [activeWorldTitle, setActiveWorldTitle] = useState<string | null>(null);
  const [activeUserRoleName, setActiveUserRoleName] = useState<string | null>(null);
  const [mediaSettings, setMediaSettings] = useState<{ baseUrl: string; visionModel: string; imageModel: string } | null>(null);
  const [mediaForm, setMediaForm] = useState({ baseUrl: "", visionModel: "", imageModel: "", apiKey: "" });
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaResult, setMediaResult] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageFileRef = useRef<HTMLInputElement | null>(null);
  const lastFailedRef = useRef<{ content: string; clientRequestId: string } | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsView | null>(null);
  const [voiceForm, setVoiceForm] = useState({
    asrBaseUrl: "",
    asrModel: "",
    asrKey: "",
    ttsBaseUrl: "",
    ttsModel: "",
    ttsVoice: "",
    ttsKey: "",
  });
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceResult, setVoiceResult] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [setupWorldId, setSetupWorldId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [latestMessageIds, setLatestMessageIds] = useState<Set<string>>(new Set());

  function markLatest(...ids: string[]) {
    setLatestMessageIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function handleSessionExpired() {
    abortRef.current?.abort();
    setSession({ status: "anonymous" });
    setConversationId(null);
    setMessages([]);
    setLatestMessageIds(new Set());
    setActiveCast([]);
    setPending(false);
  }

  async function loadBalance() {
    try {
      const response = await fetch("/api/me/balance", { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        setBalanceUnits(typeof body.balanceUnits === "number" ? body.balanceUnits : null);
      }
    } catch {
      setBalanceUnits(null);
    }
  }

  async function ensureConversation(): Promise<string | null> {
    if (conversationId) return conversationId;
    try {
      const response = await fetch("/api/chat/conversations", { method: "POST", cache: "no-store" });
      const body = await response.json();
      if (body.conversation?.id) {
        setConversationId(body.conversation.id);
        setConversations((current) => [body.conversation, ...current]);
        return body.conversation.id;
      }
    } catch {}
    return null;
  }

  async function loadConversations() {
    try {
      const response = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      const list = await response.json();
      setConversations(Array.isArray(list.conversations) ? list.conversations : []);
    } catch {}
  }

  async function loadPersonas() {
    try {
      const response = await fetch("/api/personas", { cache: "no-store" });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (response.ok) {
        const body = await response.json();
        setPersonas(Array.isArray(body.personas) ? body.personas : []);
      }
    } catch {}
  }

  async function loadUserKnowledge() {
    try {
      const response = await fetch("/api/me/knowledge", { cache: "no-store" });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (response.ok) {
        const body = await response.json();
        setUserKnowledge({
          knowledgeBase: body.knowledgeBase ?? null,
          documents: Array.isArray(body.documents) ? body.documents : [],
          chunkCount: typeof body.chunkCount === "number" ? body.chunkCount : 0,
        });
      }
    } catch {}
  }

  async function loadFavorites() {
    try {
      const response = await fetch("/api/preferences", { cache: "no-store" });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (response.ok) {
        const body = await response.json();
        setFavoriteIds(Array.isArray(body.preferences?.favoritePersonaIds) ? body.preferences.favoritePersonaIds : []);
      }
    } catch {}
  }

  async function loadLedger() {
    try {
      const response = await fetch("/api/me/ledger?page=1&pageSize=20", { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        setLedgerEntries(Array.isArray(body.entries) ? body.entries : []);
        setLedgerTotal(typeof body.total === "number" ? body.total : 0);
      }
    } catch {}
  }

  async function loadKeys() {
    try {
      const response = await fetch("/api/me/keys", { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        setKeys(Array.isArray(body.keys) ? body.keys : []);
      }
    } catch {}
  }

  async function openTools(tab: "ledger" | "keys" | "quota" | "voice" | "media") {
    setToolsTab(tab);
    setToolsOpen(true);
    if (tab === "ledger") await loadLedger();
    if (tab === "keys") await loadKeys();
    if (tab === "voice") await loadVoiceSettings();
    if (tab === "media") await loadMediaSettings();
  }

  async function loadVoiceSettings() {
    try {
      const response = await fetch("/api/me/voice", { cache: "no-store" });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) return;
      const body = await response.json();
      const settings = body.settings as VoiceSettingsView;
      setVoiceSettings(settings);
      setVoiceForm({
        asrBaseUrl: settings.asr?.baseUrl ?? "https://api.siliconflow.cn/v1",
        asrModel: settings.asr?.model ?? "FunAudioLLM/SenseVoiceSmall",
        asrKey: "",
        ttsBaseUrl: settings.tts?.baseUrl ?? "https://api.siliconflow.cn/v1",
        ttsModel: settings.tts?.model ?? "FunAudioLLM/CosyVoice2-0.5B",
        ttsVoice: settings.tts?.voice ?? "FunAudioLLM/CosyVoice2-0.5B:alex",
        ttsKey: "",
      });
    } catch {}
  }

  async function saveVoiceSettings() {
    setVoiceBusy(true);
    setVoiceError("");
    setVoiceResult("");
    const payload: { asr?: unknown; tts?: unknown } = {};
    if (voiceForm.asrBaseUrl.trim() || voiceForm.asrModel.trim() || voiceForm.asrKey) {
      payload.asr = {
        baseUrl: voiceForm.asrBaseUrl.trim(),
        model: voiceForm.asrModel.trim(),
        apiKey: voiceForm.asrKey || undefined,
      };
    }
    if (voiceForm.ttsBaseUrl.trim() || voiceForm.ttsModel.trim() || voiceForm.ttsVoice.trim() || voiceForm.ttsKey) {
      payload.tts = {
        baseUrl: voiceForm.ttsBaseUrl.trim(),
        model: voiceForm.ttsModel.trim(),
        voice: voiceForm.ttsVoice.trim() || undefined,
        apiKey: voiceForm.ttsKey || undefined,
      };
    }
    try {
      const response = await fetch("/api/me/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "保存语音设置失败。");
      setVoiceSettings(body.settings);
      setVoiceResult("语音设置已保存。");
      setVoiceForm((current) => ({ ...current, asrKey: "", ttsKey: "" }));
    } catch (reason) {
      setVoiceError(reason instanceof Error ? reason.message : "保存语音设置失败。");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function clearVoiceSection(section: "asr" | "tts") {
    setVoiceBusy(true);
    setVoiceError("");
    setVoiceResult("");
    try {
      const response = await fetch("/api/me/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [section]: null }),
      });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "清除失败。");
      setVoiceSettings(body.settings);
      setVoiceResult("语音设置已清除。");
      setVoiceForm((current) => ({
        ...current,
        ...(section === "asr"
          ? { asrBaseUrl: "", asrModel: "", asrKey: "" }
          : { ttsBaseUrl: "", ttsModel: "", ttsVoice: "", ttsKey: "" }),
      }));
    } catch (reason) {
      setVoiceError(reason instanceof Error ? reason.message : "清除失败。");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function loadWorlds() {
    try {
      const response = await fetch("/api/worlds", { cache: "no-store" });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) return;
      const body = await response.json();
      if (Array.isArray(body.worlds)) setWorlds(body.worlds);
    } catch {}
  }

  async function saveWorld(input: WorldInput) {
    const response = await fetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.status === 401) {
      handleSessionExpired();
      return;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "创建世界观失败。");
    await loadWorlds();
  }

  async function updateWorld(worldId: string, input: WorldInput) {
    const response = await fetch(`/api/worlds/${worldId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.status === 401) {
      handleSessionExpired();
      return;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "更新世界观失败。");
    await loadWorlds();
  }

  async function removeWorld(worldId: string) {
    if (!window.confirm("删除这个世界观？已开演的故事不受影响。")) return;
    const response = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
    if (!response.ok) throw new Error("删除世界观失败。");
    await loadWorlds();
  }

  async function loadMediaSettings() {
    try {
      const response = await fetch("/api/me/media", { cache: "no-store" });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) return;
      const body = await response.json();
      setMediaSettings(body.settings);
      setMediaForm({
        baseUrl: body.settings?.baseUrl ?? "https://api.siliconflow.cn/v1",
        visionModel: body.settings?.visionModel ?? "Qwen/Qwen2.5-VL-72B-Instruct",
        imageModel: body.settings?.imageModel ?? "black-forest-labs/FLUX.1-schnell",
        apiKey: "",
      });
    } catch {}
  }

  async function saveMediaSettings() {
    setMediaBusy(true);
    setMediaError("");
    setMediaResult("");
    try {
      const response = await fetch("/api/me/media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: mediaForm.baseUrl.trim(),
          visionModel: mediaForm.visionModel.trim(),
          imageModel: mediaForm.imageModel.trim(),
          apiKey: mediaForm.apiKey || undefined,
        }),
      });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "保存媒体设置失败。");
      setMediaSettings(body.settings);
      setMediaResult("媒体设置已保存。");
      setMediaForm((current) => ({ ...current, apiKey: "" }));
    } catch (reason) {
      setMediaError(reason instanceof Error ? reason.message : "保存媒体设置失败。");
    } finally {
      setMediaBusy(false);
    }
  }

  async function clearMedia() {
    const response = await fetch("/api/me/media", { method: "DELETE" });
    if (response.ok) {
      setMediaSettings(null);
      setMediaResult("媒体设置已清除。");
    }
  }

  function pickImageFile() {
    imageFileRef.current?.click();
  }

  function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("图片不能超过 8 MB。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPendingImage(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function generateImage(prompt: string) {
    const content = prompt.trim();
    if (!content || imageBusy || pending) return;
    setImageBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: content }),
      });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "图片生成失败。");
      const message = {
        id: `image-${crypto.randomUUID()}`,
        role: "assistant" as const,
        content,
        imageUrl: body.image,
      };
      setMessages((current) => [...current, message]);
      markLatest(message.id);
      setPrompt("");
      if (conversationId) {
        await fetch(`/api/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
        }).catch(() => {});
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片生成失败。");
    } finally {
      setImageBusy(false);
    }
  }

  async function transcribeVoice(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/me/voice/asr", { method: "POST", body: form });
    if (response.status === 401) {
      handleSessionExpired();
      throw new Error("登录会话已失效，请重新登录。");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "语音转文字失败。");
    return body.text;
  }

  async function speakVoice(messageId: string, text: string) {
    setSpeakingId(messageId);
    try {
      // 在用户手势内创建并唤醒 AudioContext，避免浏览器自动播放策略拦截；
      // 后续用 decodeAudioData 播放 MP3，失败会明确报错而不是静默无音。
      const audioContext = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      const response = await fetch("/api/me/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "语音朗读失败。");
      }
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = decoded;
      source.connect(audioContext.destination);
      source.onended = () => setSpeakingId(null);
      source.start();
    } catch (reason) {
      setSpeakingId(null);
      throw reason instanceof Error ? reason : new Error("语音朗读失败。");
    }
  }

  async function toggleFavorite(personaId: string) {
    const next = favoriteIds.includes(personaId)
      ? favoriteIds.filter((id) => id !== personaId)
      : [...favoriteIds, personaId];
    setFavoriteIds(next);
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoritePersonaIds: next }),
      });
    } catch {
      setFavoriteIds((current) =>
        current.includes(personaId) ? current.filter((id) => id !== personaId) : [...current, personaId],
      );
    }
  }

  async function openConversation(id: string) {
    if (!id) return;
    abortRef.current?.abort();
    setView("chat");
    setError("");
    const response = await fetch(`/api/chat/conversations/${id}`, { cache: "no-store" });
    if (response.status === 401) {
      handleSessionExpired();
      return;
    }
    const detailResponse = await response.json();
    if (!Array.isArray(detailResponse.messages)) return;
    setConversationId(id);
    setMessages(detailResponse.messages);
    setLatestMessageIds(new Set());
    setActivePersona(detailResponse.persona ?? undefined);
    setActiveCast(Array.isArray(detailResponse.cast) ? detailResponse.cast : []);
    setActiveWorldTitle(detailResponse.world?.snapshot.title ?? null);
    setActiveUserRoleName(detailResponse.userRole?.name ?? null);
    setLastKnowledgeHits(null);
    void loadMemoryForConversation(id);
  }

  async function loadMemoryForConversation(id: string) {
    try {
      const response = await fetch(`/api/chat/conversations/${id}/memory`, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        setActiveMemory(body.memory?.summary ?? null);
        setMemoryState("idle");
      }
    } catch {}
  }

  function openUserKnowledgeDrawer() {
    setUserKnowledgeOpen(true);
    void loadUserKnowledge();
  }

  async function addUserKnowledgeText(name: string, text: string) {
    setUserKnowledgeBusy(true);
    try {
      const response = await fetch("/api/me/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text, source: "paste" }),
      });
      if (response.status === 401) {
        handleSessionExpired();
        throw new Error("登录会话已失效，请重新登录。");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "保存资料失败。");
      await loadUserKnowledge();
    } finally {
      setUserKnowledgeBusy(false);
    }
  }

  async function addUserKnowledgeFile(file: File) {
    setUserKnowledgeBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/me/knowledge", { method: "POST", body: form });
      if (response.status === 401) {
        handleSessionExpired();
        throw new Error("登录会话已失效，请重新登录。");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "上传资料失败。");
      await loadUserKnowledge();
    } finally {
      setUserKnowledgeBusy(false);
    }
  }

  async function deleteUserKnowledgeDocument(documentId: string) {
    const response = await fetch(`/api/me/knowledge/documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "删除资料失败。");
    }
    await loadUserKnowledge();
  }

  async function triggerMemory(conversationId: string) {
    setMemoryState("generating");
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/memory`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMemoryState("error");
        return;
      }
      if (body?.updated && body.memory?.summary) setActiveMemory(body.memory.summary);
      setMemoryState("idle");
    } catch {
      setMemoryState("error");
    }
  }

  async function clearMemory() {
    if (!conversationId) return;
    await fetch(`/api/chat/conversations/${conversationId}/memory`, { method: "DELETE" });
    setActiveMemory(null);
    setMemoryState("idle");
  }

  function navigate(nextView: AppView) {
    setView(nextView);
    if (nextView === "chat" && !conversationId) void ensureConversation();
  }

  function openNewConversationSetup() {
    abortRef.current?.abort();
    setSetupWorldId(null);
    setSetupOpen(true);
  }

  async function startPlainConversation() {
    const response = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "chat" }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.conversation?.id) throw new Error(body?.error || "创建会话失败。");
    setConversationId(body.conversation.id);
    setConversations((current) => [body.conversation, ...current]);
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

  async function uploadInitialKnowledge(personaId: string, knowledge: KnowledgeDraft) {
    if (knowledge.file) await addKnowledgeFile(personaId, knowledge.file);
    if (knowledge.text.trim()) {
      await addKnowledgeText(personaId, knowledge.name.trim() || "初始资料", knowledge.text);
    }
  }

  async function startRoleplayConversation(
    persona: Persona,
    saveToLibrary: boolean,
    knowledge?: KnowledgeDraft,
  ) {
    let target = persona;
    if (saveToLibrary) {
      const response = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.persona?.id) throw new Error(body?.error || "保存角色失败。");
      target = body.persona;
      await loadPersonas();
    }
    const response = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "roleplay", persona: target }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.conversation?.id) throw new Error(body?.error || "创建会话失败。");
    if (knowledge) {
      try {
        await uploadInitialKnowledge(target.id, knowledge);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "初始资料上传失败。");
      }
    }
    setConversationId(body.conversation.id);
    setConversations((current) => [body.conversation, ...current]);
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
    const response = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "group", cast, director, world: selectedWorld, userRole }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.conversation?.id) throw new Error(body?.error || "创建群聊失败。");
    setConversationId(body.conversation.id);
    setConversations((current) => [body.conversation, ...current]);
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
    void runGroupOpening(body.conversation.id, cast.map((persona) => persona.name));
  }

  async function runGroupOpening(targetConversationId: string, castNames: string[]) {
    const openingMessages = [{ role: "user" as const, content: "开始群聊" }];
    const traceId = createTraceId();
    try {
      const scheduleResponse = await fetch("/api/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-ID": createClientRequestId(),
          "X-Trace-ID": traceId,
        },
        body: JSON.stringify({
          model,
          messages: openingMessages,
          knowledge: false,
          conversationId: targetConversationId,
          groupSchedule: true,
          opening: true,
        }),
      });
      if (scheduleResponse.status === 401) {
        handleSessionExpired();
        return;
      }
      const scheduleBody = await scheduleResponse.json().catch(() => null);
      if (!scheduleResponse.ok || !Array.isArray(scheduleBody?.speakers) || scheduleBody.speakers.length === 0) {
        return;
      }
      const speakers = scheduleBody.speakers as { id: string; name: string }[];
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
          const response = await fetch("/api/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Client-Request-ID": createClientRequestId(),
              "X-Trace-ID": traceId,
            },
            body: JSON.stringify({
              model,
              messages: openingMessages,
              knowledge: false,
              conversationId: targetConversationId,
              speakerId: speaker.id,
              opening: true,
            }),
          });
          if (response.status === 401) {
            handleSessionExpired();
            return;
          }
          if (!response.ok || !response.body) return;
          const messageId = messageIdBySpeaker.get(speaker.id) as string;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const prefixStripper = createSpeakerPrefixStripper(speaker.name);
          let buffer = "";
          let content = "";
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const block of events) {
              for (const line of block.split("\n")) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                const chunk = JSON.parse(data);
                if (typeof chunk?.error?.message === "string") throw new Error(chunk.error.message);
                const delta = chunk?.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  const cleaned = prefixStripper.push(delta);
                  if (cleaned) {
                    content += cleaned;
                    setMessages((current) =>
                      current.map((message) =>
                        message.id === messageId ? { ...message, content: message.content + cleaned } : message,
                      ),
                    );
                  }
                }
              }
            }
            if (done) break;
          }
          if (!content) return;
          if (containsOtherSpeakerSpeech(content, speaker.name, castNames)) {
            setMessages((current) => current.filter((message) => message.id !== messageId));
            return;
          }
          await fetch(`/api/chat/conversations/${targetConversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: messageId,
              role: "assistant",
              content,
              personaId: speaker.id,
              traceId,
            }),
          }).catch(() => {});
        }),
      );
      await loadBalance();
      await loadConversations();
    } catch {
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

  async function updateConversationMeta(id: string, patch: { title?: string; pinned?: boolean; archived?: boolean }) {
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
    const response = await fetch(`/api/chat/conversations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) await loadConversations();
  }

  async function deleteConversationById(id: string) {
    if (!window.confirm("删除该会话？此操作不可恢复。")) return;
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
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
    const response = await fetch(`/api/chat/conversations/${id}/export`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yanchuaner-ai-conversation-${id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openPersonaDetail(persona: Persona, mode: "view" | "edit" | "create" = "view") {
    setDetail({ open: true, persona, mode });
    if (mode === "view") void loadPersonaKnowledge(persona.id);
  }

  async function loadPersonaKnowledge(personaId: string) {
    try {
      const response = await fetch(`/api/personas/${personaId}/knowledge`, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        setPersonaKnowledge({
          knowledgeBase: body.knowledgeBase ?? null,
          documents: Array.isArray(body.documents) ? body.documents : [],
          chunkCount: typeof body.chunkCount === "number" ? body.chunkCount : 0,
        });
      }
    } catch {}
  }

  async function addKnowledgeText(personaId: string, name: string, text: string) {
    setKnowledgeBusy(true);
    try {
      const response = await fetch(`/api/personas/${personaId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text, source: "paste" }),
      });
      if (response.status === 401) {
        handleSessionExpired();
        throw new Error("登录会话已失效，请重新登录。");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "保存资料失败。");
      await loadPersonaKnowledge(personaId);
    } finally {
      setKnowledgeBusy(false);
    }
  }

  async function addKnowledgeFile(personaId: string, file: File) {
    setKnowledgeBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/personas/${personaId}/knowledge`, {
        method: "POST",
        body: form,
      });
      if (response.status === 401) {
        handleSessionExpired();
        throw new Error("登录会话已失效，请重新登录。");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "上传资料失败。");
      await loadPersonaKnowledge(personaId);
    } finally {
      setKnowledgeBusy(false);
    }
  }

  async function deleteKnowledgeDocument(documentId: string) {
    const personaId = detail.open && detail.persona ? detail.persona.id : "";
    const response = await fetch(`/api/personas/${personaId}/knowledge/documents/${documentId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "删除资料失败。");
    }
    if (personaId) await loadPersonaKnowledge(personaId);
  }

  async function savePersonaEdit(id: string, input: PersonaInput) {
    const response = await fetch(`/api/personas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: input }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.persona?.id) throw new Error(body?.error || "保存角色失败。");
    setPersonas((current) => current.map((persona) => (persona.id === id ? body.persona : persona)));
    setDetail({ open: true, persona: body.persona, mode: "view" });
  }

  async function createLibraryPersona(input: PersonaInput): Promise<Persona> {
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: input }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.persona?.id) throw new Error(body?.error || "创建角色失败。");
    setPersonas((current) => [...current, body.persona]);
    void loadPersonaKnowledge(body.persona.id);
    return body.persona;
  }

  async function duplicatePersona(persona: Persona) {
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona: {
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
        },
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.persona?.id) throw new Error(body?.error || "复制角色失败。");
    setPersonas((current) => [...current, body.persona]);
    setDetail({ open: true, persona: body.persona, mode: "view" });
    void loadPersonaKnowledge(body.persona.id);
  }

  async function deleteLibraryPersona(id: string) {
    if (!window.confirm("删除这个角色？已经开始的会话不受影响。")) return;
    const response = await fetch(`/api/personas/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "删除角色失败。");
    }
    setPersonas((current) => current.filter((persona) => persona.id !== id));
    await fetch(`/api/personas/${id}/knowledge`, { method: "DELETE" });
    setPersonaKnowledge(null);
    setDetail({ open: false });
  }

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return setSession({ status: "anonymous" });
        const body = await response.json();
        setSession({
          status: "authenticated",
          identity: body.identity,
          subject: body.subject,
          models: body.models,
          sessionQuotaUnits: body.sessionQuotaUnits,
          expiresAt: body.expiresAt,
        });
        setModel(body.models[0] ?? "");
        void loadBalance();
        void loadConversations();
        void loadPersonas();
        void loadFavorites();
        void loadUserKnowledge();
        void loadVoiceSettings();
        void loadWorlds();
      })
      .catch(() => setSession({ status: "anonymous" }));
  }, []);

  async function logout() {
    abortRef.current?.abort();
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ status: "anonymous" });
    setMessages([]);
    setLatestMessageIds(new Set());
    setConversationId(null);
    setView("home");
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
    if (pendingImage) {
      try {
        const visionResponse = await fetch("/api/me/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: pendingImage,
            prompt: "结合当前对话，用 100 字以内简要描述这张图片的内容。",
          }),
        });
        if (visionResponse.status === 401) {
          handleSessionExpired();
          return;
        }
        const visionBody = await visionResponse.json().catch(() => null);
        if (!visionResponse.ok) throw new Error(visionBody?.error || "图片理解失败。");
        finalContent = content
          ? `${content}\n\n（用户附带了一张图片：${visionBody.text}）`
          : `（用户发来一张图片：${visionBody.text}）`;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "图片理解失败。");
        return;
      }
    }
    const retry = !pendingImage && lastFailedRef.current?.content === content;
    const clientRequestId = retry && lastFailedRef.current ? lastFailedRef.current.clientRequestId : createClientRequestId();
    const traceId = createTraceId();
    if (retry) lastFailedRef.current = null;
    const activeConversation = conversations.find((conversation) => conversation.id === conversationId);
    const activeMode = activeConversation?.mode ?? "chat";
    const userMessage = newMessage("user", finalContent);
    setPendingImage(null);
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
        await fetch(`/api/chat/conversations/${targetConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userMessage.id, role: "user", content: userMessage.content }),
        });
        await runGroupTurn(targetConversationId, requestMessages, controller, traceId);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "模型请求失败。";
        if (message.includes("登录会话已失效")) {
          handleSessionExpired();
          return;
        }
        if (!controller.signal.aborted) {
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
      await fetch(`/api/chat/conversations/${targetConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userMessage.id, role: "user", content: userMessage.content }),
      });
      const response = await fetch("/api/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-ID": clientRequestId,
          "X-Trace-ID": traceId,
        },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          knowledge:
            (activeMode === "roleplay" || activeMode === "group") && Boolean(activePersona || activeCast.length) && knowledgeEnabled,
          conversationId: targetConversationId,
        }),
        signal: controller.signal,
      });
      const requestId = response.headers.get("x-request-id") || "";
      const knowledgeHits = Number(response.headers.get("x-yan-knowledge-hits") || 0);
      setLastKnowledgeHits(knowledgeHits > 0 ? knowledgeHits : null);
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        const message =
          body?.code === "SESSION_REVOKED"
            ? "登录会话已失效，请重新登录。"
            : response.status === 429
              ? "请求过于频繁，请稍后再试。"
              : body?.error || "模型请求失败。";
        throw new Error(message);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedContent = false;
      let assistantContent = "";
      let lastUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const block of events) {
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            const chunk = JSON.parse(data);
            if (typeof chunk?.error?.message === "string") throw new Error(chunk.error.message);
            if (chunk?.usage) lastUsage = chunk.usage;
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              receivedContent = true;
              assistantContent += delta;
              appendAssistantContent(assistantMessage.id, delta);
            }
          }
        }
        if (done) break;
      }
      if (!receivedContent) throw new Error("模型未返回可显示内容。");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                requestId,
                usage: lastUsage
                  ? {
                      prompt: lastUsage.prompt_tokens ?? 0,
                      completion: lastUsage.completion_tokens ?? 0,
                    }
                  : undefined,
              }
            : message,
        ),
      );
      await fetch(`/api/chat/conversations/${targetConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: assistantMessage.id,
          role: "assistant",
          content: assistantContent,
          traceId,
          requestId,
          usage: lastUsage
            ? {
                prompt: lastUsage.prompt_tokens ?? 0,
                completion: lastUsage.completion_tokens ?? 0,
              }
            : undefined,
        }),
      });
      await loadBalance();
      await loadConversations();
      const completedCount = messages.length + 2;
      if (activeMode === "roleplay" && completedCount >= 15 && completedCount % 15 === 0) {
        void triggerMemory(targetConversationId);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "模型请求失败。";
      if (message.includes("登录会话已失效")) {
        handleSessionExpired();
        return;
      }
      if (!controller.signal.aborted) {
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
    requestMessages: { role: "system" | "user" | "assistant"; content: string }[],
    controller: AbortController,
    traceId: string,
  ) {
    const scheduleResponse = await fetch("/api/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Request-ID": createClientRequestId(),
        "X-Trace-ID": traceId,
      },
      body: JSON.stringify({
        model,
        messages: requestMessages,
        knowledge: Boolean(activeCast.length) && knowledgeEnabled,
        conversationId: targetConversationId,
        groupSchedule: true,
      }),
      signal: controller.signal,
    });
    if (scheduleResponse.status === 401) {
      handleSessionExpired();
      throw new Error("登录会话已失效，请重新登录。");
    }
    const scheduleBody = await scheduleResponse.json().catch(() => null);
    if (!scheduleResponse.ok || !Array.isArray(scheduleBody?.speakers) || scheduleBody.speakers.length === 0) {
      throw new Error(scheduleBody?.error || "群聊调度失败，请稍后再试。");
    }
    const speakers = scheduleBody.speakers as { id: string; name: string }[];
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
        const response = await fetch("/api/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Request-ID": createClientRequestId(),
            "X-Trace-ID": traceId,
          },
          body: JSON.stringify({
            model,
            messages: requestMessages,
            knowledge: Boolean(activeCast.length) && knowledgeEnabled,
            conversationId: targetConversationId,
            speakerId: speaker.id,
          }),
          signal: controller.signal,
        });
        const requestId = response.headers.get("x-request-id") || "";
        if (response.status === 401) {
          handleSessionExpired();
          throw new Error("登录会话已失效，请重新登录。");
        }
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `${speaker.name} 发言失败。`);
        }
        const messageId = messageIdBySpeaker.get(speaker.id) as string;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const prefixStripper = createSpeakerPrefixStripper(speaker.name);
        let buffer = "";
        let content = "";
        let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const block of events) {
            for (const line of block.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              const chunk = JSON.parse(data);
              if (typeof chunk?.error?.message === "string") throw new Error(chunk.error.message);
              if (chunk?.usage) usage = chunk.usage;
              const delta = chunk?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                const cleaned = prefixStripper.push(delta);
                if (cleaned) {
                  content += cleaned;
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === messageId ? { ...message, content: message.content + cleaned } : message,
                    ),
                  );
                }
              }
            }
          }
          if (done) break;
        }
        if (!content) throw new Error(`${speaker.name} 未返回可显示内容。`);
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
                  requestId,
                  usage: usage
                    ? {
                        prompt: usage.prompt_tokens ?? 0,
                        completion: usage.completion_tokens ?? 0,
                      }
                    : undefined,
                }
              : message,
          ),
        );
        await fetch(`/api/chat/conversations/${targetConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: messageId,
            role: "assistant",
            content,
            personaId: speaker.id,
            traceId,
            requestId,
            usage: usage
              ? {
                  prompt: usage.prompt_tokens ?? 0,
                  completion: usage.completion_tokens ?? 0,
                }
              : undefined,
          }),
        });
        return { skipped: false as const };
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

  const activeConversation = conversations.find((conversation) => conversation.id === conversationId);
  const activeMode = activeConversation?.mode ?? "chat";

  const recentPersonaIds = conversations
    .filter((conversation) => conversation.mode === "roleplay" && !conversation.archived && conversation.personaId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((conversation) => conversation.personaId as string);
  const quickPersonas = [...new Set([...recentPersonaIds, ...favoriteIds])]
    .map((id) => [...personas, ...PRESET_PERSONAS].find((persona) => persona.id === id))
    .filter((persona): persona is Persona => Boolean(persona))
    .slice(0, 7);

  const detailPersona = detail.open ? detail.persona : undefined;
  const detailRecent = detailPersona
    ? conversations.filter((conversation) => conversation.personaId === detailPersona.id && !conversation.archived)
    : [];

  return (
    <main className={session.status === "authenticated" ? "app-shell" : "access-shell"}>
      <header className="topbar">
        {session.status === "authenticated" && (
          <button
            className="sidebar-toggle topbar-toggle"
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="打开导航"
          >
            <PanelLeft size={18} aria-hidden="true" />
          </button>
        )}
        <a className="brand" href="/" aria-label="燕中 AI 首页">
          <span className="brand-mark">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <span>燕中 AI</span>
        </a>
        <span className="phase">内部预览</span>
      </header>

      {session.status === "loading" && (
        <div className="status-line" aria-live="polite">
          正在确认访问状态
        </div>
      )}

      {session.status === "anonymous" && (
        <section className="access-view">
          <p className="eyebrow">YANCORE</p>
          <h1>燕中 AI 工作台</h1>
          <div className="access-panel">
            <div className="access-copy">
              <ShieldCheck size={22} aria-hidden="true" />
              <div>
                <h2>主站统一身份</h2>
                <p>面向已认证在校生、校友、教师与管理员开放；登录会话会定期失效，重新登录即可继续。</p>
              </div>
            </div>
            <a className="primary-action" href="/api/auth/login">
              <LogIn size={18} aria-hidden="true" />
              使用主站账号登录
            </a>
          </div>
        </section>
      )}

      {session.status === "authenticated" && (
        <div className="workspace-grid">
          <ConversationSidebar
            view={view}
            onNavigate={navigate}
            conversations={conversations}
            personas={personas}
            activeId={conversationId}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onSelect={(id) => {
              void openConversation(id);
              setSidebarOpen(false);
            }}
            onNew={() => {
              openNewConversationSetup();
              setSidebarOpen(false);
            }}
            onDelete={(id) => void deleteConversationById(id)}
            onExport={(id) => void exportConversationById(id)}
            onUpdate={(id, patch) => void updateConversationMeta(id, patch)}
          />

          <section className="main-panel">
            {view === "home" && (
              <HomeView
                identityName={session.identity.name}
                balanceUnits={balanceUnits}
                model={model}
                recentConversations={conversations.filter((conversation) => !conversation.archived)}
                presets={PRESET_PERSONAS}
                library={personas}
                favoriteIds={favoriteIds}
                userKnowledge={userKnowledge}
                onOpenUserKnowledge={openUserKnowledgeDrawer}
                onOpenConversation={(id) => void openConversation(id)}
                onOpenChat={() => navigate("chat")}
                onNewChat={openNewConversationSetup}
                onOpenLibrary={() => navigate("personas")}
                onOpenTools={() => openTools("ledger")}
                onOpenGuide={() => setGuideOpen(true)}
                onOpenPersona={(persona) => openPersonaDetail(persona)}
              />
            )}

            {view === "personas" && (
              <PersonaLibrary
                presets={PRESET_PERSONAS}
                library={personas}
                favoriteIds={favoriteIds}
                onOpenDetail={(persona) => openPersonaDetail(persona)}
                onNewPersona={() => setDetail({ open: true, mode: "create" })}
                onRefreshLibrary={loadPersonas}
              />
            )}

            {view === "worlds" && (
              <WorldLibrary
                worlds={worlds}
                onSaveWorld={async (input, worldId) => {
                  if (worldId) await updateWorld(worldId, input);
                  else await saveWorld(input);
                }}
                onDeleteWorld={removeWorld}
                onStartGroupFromWorld={(world) => {
                  setSetupWorldId(world.id);
                  setSetupOpen(true);
                }}
              />
            )}

            {view === "chat" && (
              <ChatStage
                conversationTitle={activeConversation?.title || "未命名会话"}
                onChangeTitle={(title) => conversationId && void updateConversationMeta(conversationId, { title })}
                activeMode={activeMode}
                activePersona={activePersona}
                cast={activeCast}
                onOpenPersonaDetail={(persona) => openPersonaDetail(persona)}
                messages={messages}
                quickPersonas={quickPersonas}
                onQuickSwitch={(persona) => {
                  abortRef.current?.abort();
                  if (persona) void switchToPersona(persona);
                  else void switchToPlain();
                }}
                model={model}
                models={session.models}
                onModelChange={setModel}
                balanceUnits={balanceUnits}
                knowledgeEnabled={knowledgeEnabled}
                onKnowledgeChange={setKnowledgeEnabled}
                lastKnowledgeHits={lastKnowledgeHits}
                memorySummary={activeMemory}
                memoryState={memoryState}
                onClearMemory={() => void clearMemory()}
                pending={pending}
                error={error}
                prompt={prompt}
                onPromptChange={setPrompt}
                onSubmit={() => void submit()}
                onStop={() => abortRef.current?.abort()}
                onExport={() => conversationId && void exportConversationById(conversationId)}
                onDelete={() => conversationId && void deleteConversationById(conversationId)}
                onNewChat={openNewConversationSetup}
                onLogout={() => void logout()}
                onOpenTools={() => openTools("ledger")}
                voiceAsrEnabled={Boolean(voiceSettings?.asr)}
                voiceTtsEnabled={Boolean(voiceSettings?.tts)}
                userRoleName={activeUserRoleName ?? undefined}
                worldTitle={activeWorldTitle}
                speakingId={speakingId}
                onAsr={transcribeVoice}
                onSpeak={speakVoice}
                pendingImage={pendingImage}
                imageBusy={imageBusy}
                latestMessageIds={latestMessageIds}
                onPickImage={pickImageFile}
                onClearImage={() => setPendingImage(null)}
                onGenerateImage={generateImage}
              />
            )}
          </section>
        </div>
      )}

      <Drawer open={toolsOpen} title="工作台工具" onClose={() => setToolsOpen(false)}>
        <div className="tools-tabs" role="tablist" aria-label="工作台工具">
          <button
            className={toolsTab === "ledger" ? "tools-tab active" : "tools-tab"}
            type="button"
            onClick={() => openTools("ledger")}
          >
            <ReceiptText size={15} aria-hidden="true" /> 流水
          </button>
          <button
            className={toolsTab === "keys" ? "tools-tab active" : "tools-tab"}
            type="button"
            onClick={() => openTools("keys")}
          >
            <KeyRound size={15} aria-hidden="true" /> API Key
          </button>
          {session.status === "authenticated" && session.identity.role === "admin" && (
          <button
            className={toolsTab === "quota" ? "tools-tab active" : "tools-tab"}
              type="button"
              onClick={() => openTools("quota")}
            >
              <Coins size={15} aria-hidden="true" /> 额度发放
            </button>
          )}
          <button
            className={toolsTab === "voice" ? "tools-tab active" : "tools-tab"}
            type="button"
            onClick={() => openTools("voice")}
          >
            <Mic size={15} aria-hidden="true" /> 语音
          </button>
          <button
            className={toolsTab === "media" ? "tools-tab active" : "tools-tab"}
            type="button"
            onClick={() => openTools("media")}
          >
            <Palette size={15} aria-hidden="true" /> 媒体
          </button>
        </div>

        {toolsTab === "ledger" && (
          <section className="tool-section" aria-live="polite">
            <h2>额度流水（{ledgerTotal}）</h2>
            {ledgerEntries.length === 0 ? (
              <p className="status-line">暂无流水记录</p>
            ) : (
              <ul className="ledger-list">
                {ledgerEntries.map((entry) => (
                  <li className="ledger-item" key={entry.id}>
                    <span className="ledger-amount">{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</span>
                    <span className="ledger-copy">
                      <strong>
                        {entry.entry_type} · {entry.funding_source}
                      </strong>
                      <small>{entry.reason || "—"}</small>
                      <small>
                        {entry.request_id ? `request ${entry.request_id}` : ""} ·{" "}
                        {new Date(entry.created_at * 1000).toLocaleString("zh-CN")}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {toolsTab === "keys" && (
          <section className="tool-section" aria-live="polite">
            <h2>个人 API Key</h2>
            <form className="quota-form" onSubmit={submitKey}>
              <label>
                <span>名称</span>
                <input
                  type="text"
                  maxLength={50}
                  value={keyForm.name}
                  onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>预算（额度单位）</span>
                <input
                  type="number"
                  min="1"
                  value={keyForm.remainQuota}
                  onChange={(event) => setKeyForm({ ...keyForm, remainQuota: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>有效期</span>
                <select
                  value={keyForm.expiryDays}
                  onChange={(event) => setKeyForm({ ...keyForm, expiryDays: event.target.value })}
                >
                  <option value="7">7 天</option>
                  <option value="30">30 天</option>
                  <option value="90">90 天</option>
                </select>
              </label>
              <label>
                <span>模型</span>
                <div className="model-checks">
                  {session.status === "authenticated" &&
                    session.models.map((item) => (
                      <label key={item} className="model-check">
                        <input
                          type="checkbox"
                          checked={keyForm.models.includes(item)}
                          onChange={(event) =>
                            setKeyForm((current) => ({
                              ...current,
                              models: event.target.checked
                                ? [...current.models, item]
                                : current.models.filter((currentModel) => currentModel !== item),
                            }))
                          }
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                </div>
              </label>
              <button className="primary-action" type="submit">
                创建 Key
              </button>
            </form>
            {createdKey && (
              <div className="one-time-key">
                <strong>请立即保存，只显示一次：</strong>
                <code>{createdKey}</code>
              </div>
            )}
            {keysError && (
              <p className="request-error" role="alert">
                {keysError}
              </p>
            )}
            <ul className="ledger-list">
              {keys.map((item) => (
                <li className="ledger-item" key={item.id}>
                  <span className="ledger-amount">{item.status === 1 ? "启用" : "停用"}</span>
                  <span className="ledger-copy">
                    <strong>
                      {item.name || "未命名"} · {item.key}
                    </strong>
                    <small>
                      {item.model_limits || "全部模型"} · 剩余 {item.remain_quota}
                    </small>
                    <small>有效期至 {new Date(item.expired_time * 1000).toLocaleString("zh-CN")}</small>
                  </span>
                  <button className="icon-action danger" type="button" onClick={() => deleteKey(item.id)} aria-label="删除 Key">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {toolsTab === "quota" && session.status === "authenticated" && session.identity.role === "admin" && (
          <section className="tool-section" aria-live="polite">
            <h2>公益额度发放</h2>
            <form className="quota-form" onSubmit={submitQuota}>
              <label>
                <span>目标用户 ID</span>
                <input
                  type="number"
                  min="1"
                  value={quotaForm.userId}
                  onChange={(event) => setQuotaForm({ ...quotaForm, userId: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>操作</span>
                <select
                  value={quotaForm.action}
                  onChange={(event) => setQuotaForm({ ...quotaForm, action: event.target.value })}
                >
                  <option value="grant">发放（只允许正数）</option>
                  <option value="adjust">调整（可回退）</option>
                </select>
              </label>
              <label>
                <span>金额（额度单位）</span>
                <input
                  type="number"
                  value={quotaForm.amount}
                  onChange={(event) => setQuotaForm({ ...quotaForm, amount: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>原因</span>
                <input
                  type="text"
                  maxLength={200}
                  value={quotaForm.reason}
                  onChange={(event) => setQuotaForm({ ...quotaForm, reason: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>线下收款凭证</span>
                <input
                  type="text"
                  maxLength={128}
                  value={quotaForm.reference}
                  onChange={(event) => setQuotaForm({ ...quotaForm, reference: event.target.value })}
                  required
                />
              </label>
              <button className="primary-action" type="submit">
                确认发放
              </button>
            </form>
            {quotaError && (
              <p className="request-error" role="alert">
                {quotaError}
              </p>
            )}
            {quotaResult && <p className="quota-success">{quotaResult}</p>}
          </section>
        )}

        {toolsTab === "voice" && (
          <section className="tool-section" aria-live="polite">
            <h2>语音设置</h2>
            <p className="tool-hint">
              使用你自己的 OpenAI 兼容 ASR / TTS 服务。API Key 加密保存，只用于语音请求，不会回显。
            </p>

            <h3 className="tool-sub">语音输入（ASR）</h3>
            <div className="quota-form">
              <label>
                <span>服务地址</span>
                <input
                  type="text"
                  value={voiceForm.asrBaseUrl}
                  onChange={(event) => setVoiceForm({ ...voiceForm, asrBaseUrl: event.target.value })}
                  placeholder="https://api.siliconflow.cn/v1"
                />
              </label>
              <label>
                <span>模型</span>
                <input
                  type="text"
                  value={voiceForm.asrModel}
                  onChange={(event) => setVoiceForm({ ...voiceForm, asrModel: event.target.value })}
                  placeholder="FunAudioLLM/SenseVoiceSmall"
                />
              </label>
              <label className="tool-full">
                <span>API Key（留空保持不变）</span>
                <input
                  type="password"
                  value={voiceForm.asrKey}
                  onChange={(event) => setVoiceForm({ ...voiceForm, asrKey: event.target.value })}
                  placeholder="sk-…"
                />
              </label>
            </div>
            {voiceSettings?.asr && (
              <button className="ghost-action" type="button" onClick={() => void clearVoiceSection("asr")} disabled={voiceBusy}>
                清除语音输入配置
              </button>
            )}

            <h3 className="tool-sub">语音朗读（TTS）</h3>
            <div className="quota-form">
              <label>
                <span>服务地址</span>
                <input
                  type="text"
                  value={voiceForm.ttsBaseUrl}
                  onChange={(event) => setVoiceForm({ ...voiceForm, ttsBaseUrl: event.target.value })}
                  placeholder="https://api.siliconflow.cn/v1"
                />
              </label>
              <label>
                <span>模型</span>
                <input
                  type="text"
                  value={voiceForm.ttsModel}
                  onChange={(event) => setVoiceForm({ ...voiceForm, ttsModel: event.target.value })}
                  placeholder="FunAudioLLM/CosyVoice2-0.5B"
                />
              </label>
              <label>
                <span>音色</span>
                <input
                  type="text"
                  value={voiceForm.ttsVoice}
                  onChange={(event) => setVoiceForm({ ...voiceForm, ttsVoice: event.target.value })}
                  placeholder="FunAudioLLM/CosyVoice2-0.5B:alex"
                />
              </label>
              <label className="tool-full">
                <span>API Key（留空保持不变）</span>
                <input
                  type="password"
                  value={voiceForm.ttsKey}
                  onChange={(event) => setVoiceForm({ ...voiceForm, ttsKey: event.target.value })}
                  placeholder="sk-…"
                />
              </label>
            </div>
            {voiceSettings?.tts && (
              <button className="ghost-action" type="button" onClick={() => void clearVoiceSection("tts")} disabled={voiceBusy}>
                清除语音朗读配置
              </button>
            )}

            <button className="primary-action" type="button" onClick={() => void saveVoiceSettings()} disabled={voiceBusy}>
              {voiceBusy ? "保存中…" : "保存语音设置"}
            </button>
            {voiceResult && <p className="quota-success">{voiceResult}</p>}
            {voiceError && (
              <p className="request-error" role="alert">
                {voiceError}
              </p>
            )}
            <p className="tool-hint">
              {voiceSettings?.updatedAt
                ? `最近保存：${new Date(voiceSettings.updatedAt).toLocaleString("zh-CN")}`
                : "尚未保存语音设置。"}
            </p>
          </section>
        )}


        {toolsTab === "media" && (
          <section className="tool-section" aria-live="polite">
            <h2>媒体设置</h2>
            <p className="tool-hint">
              使用你自己的 OpenAI 兼容视觉 / 画图服务。API Key 加密保存，只用于媒体请求，不会回显。开发阶段默认硅基流动模型。
            </p>
            <div className="quota-form">
              <label className="tool-full">
                <span>服务地址</span>
                <input
                  type="text"
                  value={mediaForm.baseUrl}
                  onChange={(event) => setMediaForm({ ...mediaForm, baseUrl: event.target.value })}
                  placeholder="https://api.siliconflow.cn/v1"
                />
              </label>
              <label className="tool-full">
                <span>视觉模型（看图）</span>
                <input
                  type="text"
                  value={mediaForm.visionModel}
                  onChange={(event) => setMediaForm({ ...mediaForm, visionModel: event.target.value })}
                  placeholder="Qwen/Qwen2.5-VL-72B-Instruct"
                />
              </label>
              <label className="tool-full">
                <span>画图模型</span>
                <input
                  type="text"
                  value={mediaForm.imageModel}
                  onChange={(event) => setMediaForm({ ...mediaForm, imageModel: event.target.value })}
                  placeholder="black-forest-labs/FLUX.1-schnell"
                />
              </label>
              <label className="tool-full">
                <span>API Key（留空保持不变）</span>
                <input
                  type="password"
                  value={mediaForm.apiKey}
                  onChange={(event) => setMediaForm({ ...mediaForm, apiKey: event.target.value })}
                  placeholder="sk-…"
                />
              </label>
            </div>
            <button className="primary-action" type="button" onClick={() => void saveMediaSettings()} disabled={mediaBusy}>
              {mediaBusy ? "保存中…" : "保存媒体设置"}
            </button>
            {mediaSettings && (
              <button className="ghost-action" type="button" onClick={() => void clearMedia()} disabled={mediaBusy}>
                清除媒体设置
              </button>
            )}
            {mediaResult && <p className="quota-success">{mediaResult}</p>}
            {mediaError && (
              <p className="request-error" role="alert">
                {mediaError}
              </p>
            )}
            <p className="tool-hint">
              {mediaSettings?.baseUrl
                ? `已配置：${mediaSettings.baseUrl}`
                : "尚未配置媒体服务。"}
            </p>
          </section>
        )}
      </Drawer>

      <input
        ref={imageFileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleImageFile(file);
          event.target.value = "";
        }}
      />

      <PersonaSetup
        open={setupOpen}
        presets={PRESET_PERSONAS}
        library={personas}
        worlds={worlds}
        initialWorldId={setupWorldId}
        onClose={() => {
          setSetupOpen(false);
          setSetupWorldId(null);
        }}
        onStartChat={startPlainConversation}
        onStartRoleplay={startRoleplayConversation}
        onStartGroup={startGroupConversation}
        onDeletePersona={deleteLibraryPersona}
      />

      <GuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />

      <UserKnowledgeDrawer
        open={userKnowledgeOpen}
        knowledge={userKnowledge}
        busy={userKnowledgeBusy}
        onClose={() => setUserKnowledgeOpen(false)}
        onAddText={addUserKnowledgeText}
        onAddFile={addUserKnowledgeFile}
        onDelete={deleteUserKnowledgeDocument}
      />

      {detail.open && (
        <PersonaDetail
          persona={detailPersona}
          mode={detail.mode}
          favorite={detailPersona ? favoriteIds.includes(detailPersona.id) : false}
          recentConversations={detailRecent}
          knowledge={personaKnowledge}
          knowledgeBusy={knowledgeBusy}
          onAddKnowledgeText={async (name, text) => {
            if (detailPersona) await addKnowledgeText(detailPersona.id, name, text);
          }}
          onAddKnowledgeFile={async (file) => {
            if (detailPersona) await addKnowledgeFile(detailPersona.id, file);
          }}
          onDeleteKnowledgeDocument={deleteKnowledgeDocument}
          onClose={() => {
            setDetail({ open: false });
            setPersonaKnowledge(null);
          }}
          onStart={(persona) => void startRoleplayConversation(persona, false)}
          onContinue={(id) => {
            setDetail({ open: false });
            void openConversation(id);
          }}
          onToggleFavorite={() => detailPersona && void toggleFavorite(detailPersona.id)}
          onEdit={() => detailPersona && setDetail({ open: true, persona: detailPersona, mode: "edit" })}
          onSave={async (input) => {
            if (detailPersona) await savePersonaEdit(detailPersona.id, input);
          }}
          onCreate={async (input, knowledge) => {
            const persona = await createLibraryPersona(input);
            if (knowledge) {
              try {
                await uploadInitialKnowledge(persona.id, knowledge);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "初始资料上传失败。");
              }
            }
            await loadPersonaKnowledge(persona.id);
            setDetail({ open: true, persona, mode: "view" });
          }}
          onDelete={() => detailPersona && void deleteLibraryPersona(detailPersona.id)}
          onDuplicate={() => detailPersona && void duplicatePersona(detailPersona)}
        />
      )}

    </main>
  );

  async function submitKey(event: FormEvent) {
    event.preventDefault();
    setKeysError("");
    setCreatedKey("");
    const response = await fetch("/api/me/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: keyForm.name,
        models: keyForm.models.join(","),
        remainQuota: Number(keyForm.remainQuota),
        expiredTime: Math.floor(Date.now() / 1000) + Number(keyForm.expiryDays) * 86400,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.key) {
      setKeysError(body?.error || "Key 创建失败。");
      return;
    }
    setCreatedKey(body.key);
    setKeyForm({ name: "", models: ["deepseek-v4-flash"], remainQuota: "100000", expiryDays: "30" });
    await loadKeys();
  }

  async function deleteKey(id: number) {
    if (!window.confirm("删除该 Key？使用它的请求将立即失效。")) return;
    const response = await fetch(`/api/me/keys/${id}`, { method: "DELETE" });
    if (response.ok) await loadKeys();
  }

  async function submitQuota(event: FormEvent) {
    event.preventDefault();
    setQuotaResult("");
    setQuotaError("");
    const response = await fetch("/api/admin/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: Number(quotaForm.userId),
        action: quotaForm.action,
        amount: Number(quotaForm.amount),
        reason: quotaForm.reason,
        reference: quotaForm.reference,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.balanceAfter) {
      setQuotaError(body?.error || "额度发放失败。");
      return;
    }
    setQuotaResult(`发放成功，最新余额 ${body.balanceAfter}`);
    setQuotaForm((current) => ({ ...current, userId: "", amount: "", reference: "" }));
    void loadBalance();
  }
}
