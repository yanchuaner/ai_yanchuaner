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
import { useEffect, useRef, useState } from "react";
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
import { PRESET_PERSONAS, type Persona, type PersonaInput } from "@/lib/personas";
import { AccountActionError, loadAccountSession } from "@/lib/account";
import { appendConversationMessage, ConversationActionError } from "@/lib/conversation-actions";
import { ChatActionError } from "@/lib/chat-actions";
import { ActionError } from "@/lib/action-http";
import { useAccountState } from "@/hooks/use-account-state";
import { useConversationState } from "@/hooks/use-conversation-state";
import { useMediaState } from "@/hooks/use-media-state";
import { usePersonaState, type DetailState } from "@/hooks/use-persona-state";
import { useVoiceState } from "@/hooks/use-voice-state";
import { useWorldState } from "@/hooks/use-world-state";
import type { WorldSnapshot } from "@/lib/worlds";
import type { AppView } from "@/lib/types";

export default function HomePage() {
  const abortRef = useRef<AbortController | null>(null);
  const [view, setView] = useState<AppView>("home");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<"ledger" | "keys" | "quota" | "voice" | "media">("ledger");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [setupWorldId, setSetupWorldId] = useState<string | null>(null);

  const account = useAccountState({
    abortRef,
    onSessionExpired: () => {},
  });
  const {
    session,
    setSession,
    handleSessionExpired,
    loadBalance,
    loadLedger,
    loadKeys,
    submitKey,
    deleteKey,
    submitQuota,
    logout: logoutAccountAction,
    balanceUnits,
    ledgerEntries,
    ledgerTotal,
    ledgerError,
    quotaForm,
    setQuotaForm,
    quotaResult,
    quotaError,
    keys,
    keyForm,
    setKeyForm,
    createdKey,
    keysError,
  } = account;

  const world = useWorldState({ onUnauthenticated: handleSessionExpired });
  const { worlds, loadWorlds, saveWorld, updateWorld, removeWorld: removeWorldAction } = world;

  const media = useMediaState({ onUnauthenticated: handleSessionExpired });
  const {
    mediaSettings,
    mediaForm,
    setMediaForm,
    mediaBusy,
    mediaResult,
    mediaError,
    pendingImage,
    setPendingImage,
    imageBusy,
    imageFileRef,
    loadMediaSettings,
    saveMediaSettings,
    clearMedia,
    pickImageFile,
    handleImageFile: handleImageFileAction,
    generateImage: generateImageAction,
    describeImage,
  } = media;

  const voice = useVoiceState({ onUnauthenticated: handleSessionExpired });
  const {
    voiceSettings,
    voiceForm,
    setVoiceForm,
    voiceBusy,
    voiceResult,
    voiceError,
    speakingId,
    loadVoiceSettings,
    saveVoiceSettings,
    clearVoiceSection,
    transcribeVoice,
    speakVoice,
  } = voice;

  const persona = usePersonaState({ onUnauthenticated: handleSessionExpired });
  const {
    personas,
    favoriteIds,
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
  } = persona;

  const conversation = useConversationState({
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
    media: { pendingImage, setPendingImage, describeImage },
  });
  const {
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
    conversations,
    activePersona,
    activeCast,
    knowledgeEnabled,
    setKnowledgeEnabled,
    lastKnowledgeHits,
    activeMemory,
    memoryState,
    activeWorldTitle,
    activeUserRoleName,
    latestMessageIds,
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
  } = conversation;

  function handleImageFile(file: File) {
    const message = handleImageFileAction(file);
    if (message) setError(message);
  }

  async function generateImage(prompt: string) {
    const content = prompt.trim();
    if (!content || imageBusy || pending) return;
    setError("");
    try {
      const image = await generateImageAction(content);
      const message = {
        id: `image-${crypto.randomUUID()}`,
        role: "assistant" as const,
        content,
        imageUrl: image,
      };
      setMessages((current) => [...current, message]);
      markLatest(message.id);
      setPrompt("");
      if (conversationId) {
        await appendConversationMessage(conversationId, message).catch(() => {});
      }
    } catch (reason) {
      const message = handleConversationError(reason);
      setError(message ?? "图片生成失败。");
    }
  }

  async function removeWorld(worldId: string) {
    if (!window.confirm("删除这个世界观？已开演的故事不受影响。")) return;
    await removeWorldAction(worldId);
  }

  async function logout() {
    await logoutAccountAction();
    setView("home");
  }

  useEffect(() => {
    void loadAccountSession()
      .then((result) => {
        if (result.status === "authenticated") {
          const { identity, subject, models, sessionQuotaUnits, expiresAt } = result.session;
          setSession({ status: "authenticated", identity, subject, models, sessionQuotaUnits, expiresAt });
          setModel(models[0] ?? "");
          void loadBalance();
          void loadConversations();
          void loadPersonas();
          void loadFavorites();
          void loadUserKnowledge();
          void loadVoiceSettings();
          void loadWorlds();
          return;
        }
        if (result.status === "unavailable") {
          setSession({ status: "anonymous", message: result.message });
          return;
        }
        setSession({ status: "anonymous" });
      })
      .catch(() => setSession({ status: "anonymous" }));
  }, []);

  function isSessionError(error: unknown): boolean {
    return (
      (error instanceof AccountActionError && error.code === "unauthenticated") ||
      (error instanceof ConversationActionError && error.code === "unauthenticated") ||
      (error instanceof ChatActionError && error.code === "unauthenticated") ||
      (error instanceof ActionError && error.code === "unauthenticated")
    );
  }

  function handleConversationError(error: unknown): string | null {
    if (isSessionError(error)) {
      handleSessionExpired();
      return null;
    }
    return error instanceof Error ? error.message : "操作失败。";
  }

  async function openTools(tab: "ledger" | "keys" | "quota" | "voice" | "media") {
    setToolsTab(tab);
    setToolsOpen(true);
    if (tab === "ledger") await loadLedger();
    if (tab === "keys") await loadKeys();
    if (tab === "voice") await loadVoiceSettings();
    if (tab === "media") await loadMediaSettings();
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
          {session.message && (
            <p className="request-error" role="alert">
              {session.message}
            </p>
          )}
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
            {ledgerError && (
              <p className="request-error" role="alert">
                {ledgerError}
              </p>
            )}
            {ledgerEntries.length === 0 ? (
              <p className="status-line">暂无流水记录</p>
            ) : (
              <ul className="ledger-list">
                {ledgerEntries.map((entry) => (
                  <li className="ledger-item" key={entry.id}>
                    <span className="ledger-amount">{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</span>
                    <span className="ledger-copy">
                      <strong>
                        {entry.entryType} · {entry.fundingSource}
                      </strong>
                      <small>{entry.reason || "—"}</small>
                      <small>
                        {entry.requestId ? `request ${entry.requestId}` : ""} ·{" "}
                        {new Date(entry.createdAt * 1000).toLocaleString("zh-CN")}
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
                      {item.modelLimits || "全部模型"} · 剩余 {item.remainQuota}
                    </small>
                    <small>有效期至 {new Date(item.expiredTime * 1000).toLocaleString("zh-CN")}</small>
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

}
