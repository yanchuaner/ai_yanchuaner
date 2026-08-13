"use client";

import {
  Check,
  Download,
  ImagePlus,
  LogOut,
  Mic,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  Square,
  Volume2,
  Wand2,
  Trash2,
  User,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageContent } from "@/components/markdown";
import { type Persona } from "@/lib/personas";
import type { ChatMessage, ChatMode } from "@/lib/types";
import styles from "./chat-stage.module.css";

type ChatStageProps = {
  conversationTitle: string;
  onChangeTitle: (title: string) => void;
  activeMode: ChatMode;
  activePersona?: Persona;
  cast: Persona[];
  onOpenPersonaDetail: (persona: Persona) => void;
  messages: ChatMessage[];
  quickPersonas: Persona[];
  onQuickSwitch: (persona?: Persona) => void;
  model: string;
  models: string[];
  onModelChange: (model: string) => void;
  balanceUnits: number | null;
  knowledgeEnabled: boolean;
  onKnowledgeChange: (enabled: boolean) => void;
  lastKnowledgeHits: number | null;
  memorySummary: string | null;
  memoryState: "idle" | "generating" | "error";
  onClearMemory: () => void;
  pending: boolean;
  error: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onExport: () => void;
  onDelete: () => void;
  onNewChat: () => void;
  onLogout: () => void;
  onOpenTools: () => void;
  voiceAsrEnabled: boolean;
  voiceTtsEnabled: boolean;
  userRoleName?: string;
  worldTitle?: string | null;
  speakingId: string | null;
  onAsr: (file: File) => Promise<string>;
  onSpeak: (messageId: string, text: string) => Promise<void>;
  pendingImage?: string | null;
  imageBusy?: boolean;
  onPickImage: () => void;
  onClearImage: () => void;
  onGenerateImage: (prompt: string) => Promise<void>;
};

function HumanistMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 4a8 8 0 1 0 8 8" />
      <path d="M8 13.5c1.2-1.5 2.4-1.5 3.6 0s2.4 1.5 3.6 0" />
    </svg>
  );
}

export function ChatStage({
  conversationTitle,
  onChangeTitle,
  activeMode,
  activePersona,
  cast,
  onOpenPersonaDetail,
  messages,
  quickPersonas,
  onQuickSwitch,
  model,
  models,
  onModelChange,
  balanceUnits,
  knowledgeEnabled,
  onKnowledgeChange,
  lastKnowledgeHits,
  memorySummary,
  memoryState,
  onClearMemory,
  pending,
  error,
  prompt,
  onPromptChange,
  onSubmit,
  onStop,
  onExport,
  onDelete,
  onNewChat,
  onLogout,
  onOpenTools,
  voiceAsrEnabled,
  voiceTtsEnabled,
  userRoleName,
  worldTitle,
  speakingId,
  onAsr,
  onSpeak,
  pendingImage,
  imageBusy,
  onPickImage,
  onClearImage,
  onGenerateImage,
}: ChatStageProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const [contextOpen, setContextOpen] = useState(true);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTitleDraft(conversationTitle);
    setEditingTitle(false);
  }, [conversationTitle, activePersona?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const displayMessages: ChatMessage[] =
    activePersona?.firstMessage?.trim()
      ? [{ id: "persona-greeting", role: "assistant", content: activePersona.firstMessage }, ...messages]
      : messages;
  const hour = new Date().getHours();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const period = hour < 5 ? "深夜" : hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";
  const greetingText = `${weekdays[new Date().getDay()]}的${period}，准备好开始了吗？`;
  const promptSuggestions = ["帮我列一份本周学习计划", "写一段一分钟的自我介绍", "用大白话解释什么是熵"];

  const totalUsage = messages.reduce(
    (sum, message) =>
      message.usage
        ? { prompt: sum.prompt + message.usage.prompt, completion: sum.completion + message.usage.completion }
        : sum,
    { prompt: 0, completion: 0 },
  );

  function commitTitle() {
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (title && title !== conversationTitle) onChangeTitle(title);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  async function toggleRecording() {
    setVoiceError("");
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        try {
          const text = await onAsr(new File([blob], "voice.webm", { type: blob.type }));
          if (text.trim()) onPromptChange(text);
        } catch (reason) {
          setVoiceError(reason instanceof Error ? reason.message : "语音转文字失败。");
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      setVoiceError("无法访问麦克风，请检查浏览器权限。");
    }
  }

  return (
    <section className={styles.stage}>
      <header className={styles.toolbar}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <span className={styles.modeChip}>
              {activeMode === "roleplay" ? "角色扮演" : activeMode === "group" ? "多人群聊" : "普通助手"}
            </span>
            {editingTitle ? (
              <input
                className={styles.titleInput}
                type="text"
                maxLength={60}
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitTitle();
                  if (event.key === "Escape") setEditingTitle(false);
                }}
                aria-label="会话标题"
              />
            ) : (
              <button className={styles.titleButton} type="button" onClick={() => setEditingTitle(true)} title="重命名会话">
                <strong>{conversationTitle || "未命名会话"}</strong>
                <Pencil size={13} aria-hidden="true" />
              </button>
            )}
          </div>

          {activePersona ? (
            <button
              className={styles.personaBar}
              type="button"
              onClick={() => onOpenPersonaDetail(activePersona)}
              title="查看角色详情"
            >
              <span className={styles.personaAvatar}>{activePersona.avatar || "🎭"}</span>
              <span className={styles.personaCopy}>
                <strong>{activePersona.name}</strong>
                <small>{activePersona.description.slice(0, 42)}{activePersona.description.length > 42 ? "…" : ""}</small>
              </span>
              <Check size={13} aria-hidden="true" />
            </button>
          ) : cast.length > 0 ? (
            <div className={styles.castRow}>
              {cast.map((persona) => (
                <button
                  key={persona.id}
                  className={styles.castChip}
                  type="button"
                  onClick={() => onOpenPersonaDetail(persona)}
                  title="查看角色详情"
                >
                  <span>{persona.avatar || "🎭"}</span>
                  {persona.name}
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.plainHint}>正在使用普通助手，直接问答即可。</span>
          )}
        </div>

        <div className={styles.toolbarActions}>
          <label className={styles.modelPicker}>
            <span>模型</span>
            <select value={model} onChange={(event) => onModelChange(event.target.value)} disabled={pending}>
              {models.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.toolButton} type="button" onClick={onOpenTools} title="额度与 Key" aria-label="额度与 Key">
            <ReceiptText size={17} aria-hidden="true" />
          </button>
          <button className={styles.toolButton} type="button" onClick={onExport} title="导出会话" aria-label="导出会话">
            <Download size={17} aria-hidden="true" />
          </button>
          <button className={`${styles.toolButton} ${styles.danger}`} type="button" onClick={onDelete} title="删除会话" aria-label="删除会话">
            <Trash2 size={17} aria-hidden="true" />
          </button>
          <button className={styles.toolButton} type="button" onClick={onNewChat} title="新对话" aria-label="新对话">
            <Plus size={18} aria-hidden="true" />
          </button>
          <button className={styles.toolButton} type="button" onClick={onLogout} title="退出登录" aria-label="退出登录">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.quickRail} aria-label="快速切换">
            <button
              className={`${styles.quickItem} ${!activePersona ? styles.quickActive : ""}`}
              type="button"
              onClick={() => onQuickSwitch(undefined)}
            >
              <span className={styles.quickAvatar}>
                <HumanistMark size={15} />
              </span>
              <span>普通助手</span>
            </button>
            {quickPersonas.slice(0, 7).map((persona) => (
              <button
                key={persona.id}
                className={`${styles.quickItem} ${activePersona?.id === persona.id ? styles.quickActive : ""}`}
                type="button"
                onClick={() => onQuickSwitch(persona)}
                title={persona.name}
              >
                <span className={styles.quickAvatar}>{persona.avatar || "🎭"}</span>
                <span>{persona.name}</span>
              </button>
            ))}
          </div>

          <div className={styles.messages} aria-live="polite">
            {displayMessages.length === 0 && (
              <div className={styles.empty}>
                {activeMode === "group" && cast.length > 0 ? (
                  <>
                    <div className={styles.castReady}>
                      {cast.map((persona) => (
                        <span key={persona.id} title={persona.name}>
                          {persona.avatar || "🎭"}
                        </span>
                      ))}
                    </div>
                    <h1>群聊已就绪</h1>
                    <p>先打个招呼，角色们会轮流回应你。</p>
                  </>
                ) : (
                  <>
                    <span className={styles.emptyMark}>
                      <HumanistMark size={30} />
                    </span>
                    <h1>{greetingText}</h1>
                    <p>想从哪开始？挑一个问题，或直接输入你的想法。</p>
                    <div className={styles.promptCards}>
                      {promptSuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion}
                          className={`${styles.promptCard} ${index % 2 === 1 ? styles.promptCardAlt : ""}`}
                          type="button"
                          onClick={() => onPromptChange(suggestion)}
                        >
                          <span className={styles.promptMark}>「</span>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {displayMessages.map((message) => {
              const speaker =
                message.role === "assistant" && message.personaId
                  ? cast.find((persona) => persona.id === message.personaId)
                  : activePersona;
              return (
                <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`} key={message.id}>
                  <span className={styles.messageIcon}>
                    {message.role === "user" ? <User size={16} aria-hidden="true" /> : speaker?.avatar || <HumanistMark size={16} />}
                  </span>
                  <div className={styles.messageBody}>
                    {message.role === "user" && userRoleName ? (
                      <small className={styles.speakerName}>{userRoleName}</small>
                    ) : message.role === "assistant" && message.personaId ? (
                      <small className={styles.speakerName}>{speaker?.name || "群成员"}</small>
                    ) : null}
                    {message.content ? (
                      <MessageContent content={message.content} />
                    ) : (
                      <span className={styles.thinking}>正在生成…</span>
                    )}
                    {message.imageUrl && (
                      <img
                        className={styles.messageImage}
                        src={message.imageUrl}
                        alt="AI 生成的图片"
                        loading="lazy"
                      />
                    )}
                    {message.role === "assistant" && (message.requestId || message.usage) && (
                      <small className={styles.meta}>
                        {message.requestId ? `request ${message.requestId}` : ""}
                        {message.usage ? ` · 输入 ${message.usage.prompt} / 输出 ${message.usage.completion}` : ""}
                      </small>
                    )}
                    {message.role === "assistant" && voiceTtsEnabled && message.content && (
                      <button
                        className={styles.speakButton}
                        type="button"
                        disabled={speakingId === message.id}
                        onClick={() => {
                          setVoiceError("");
                          void onSpeak(message.id, message.content).catch((reason) => {
                            setVoiceError(reason instanceof Error ? reason.message : "语音朗读失败。");
                          });
                        }}
                      >
                        <Volume2 size={13} aria-hidden="true" />
                        {speakingId === message.id ? "朗读中…" : "朗读"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className={styles.composerWrap}>
            {voiceError && (
              <p className={styles.error} role="alert">
                {voiceError}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <form className={styles.composer} onSubmit={handleSubmit}>
              {pendingImage && (
                <div className={styles.imagePreview}>
                  <img src={pendingImage} alt="待发送图片" />
                  <button type="button" onClick={onClearImage} aria-label="移除图片">
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
              <textarea
                aria-label="消息"
                placeholder={activePersona ? `对「${activePersona.name}」说点什么…` : "输入消息"}
                rows={2}
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={pending}
              />
              {pending ? (
                <button className={styles.stop} type="button" onClick={onStop} title="停止生成" aria-label="停止生成">
                  <Square size={16} fill="currentColor" aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button
                    className={`${styles.micButton} ${recording ? styles.micRecording : ""}`}
                    type="button"
                    disabled={!voiceAsrEnabled}
                    onClick={() => void toggleRecording()}
                    title={voiceAsrEnabled ? (recording ? "停止录音" : "语音输入") : "未配置语音输入"}
                    aria-label={recording ? "停止录音" : "语音输入"}
                  >
                    {recording ? <Square size={15} fill="currentColor" aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
                  </button>
                  <button
                    className={styles.micButton}
                    type="button"
                    disabled={pending || !prompt.trim()}
                    onClick={() => void onGenerateImage(prompt)}
                    title="用当前输入生成图片"
                    aria-label="生成图片"
                  >
                    <Wand2 size={16} aria-hidden="true" />
                  </button>
                  <button
                    className={styles.micButton}
                    type="button"
                    disabled={pending}
                    onClick={onPickImage}
                    title="上传图片让角色看"
                    aria-label="上传图片"
                  >
                    <ImagePlus size={17} aria-hidden="true" />
                  </button>
                  <button className={styles.send} type="submit" disabled={!prompt.trim() || !model} title="发送" aria-label="发送">
                    <Send size={17} aria-hidden="true" />
                  </button>
                </>
              )}
            </form>
            <button className={styles.contextToggle} type="button" onClick={() => setContextOpen((open) => !open)}>
              {contextOpen ? "收起上下文" : "展开上下文"}
            </button>
          </div>
        </div>

        {contextOpen && (
          <aside className={styles.context} aria-label="会话上下文">
            <header>
              <strong>会话信息</strong>
              <button type="button" onClick={() => setContextOpen(false)} aria-label="收起上下文">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <section className={styles.contextSection}>
              <h3>额度</h3>
              <p className={styles.balance}>{balanceUnits === null ? "—" : balanceUnits} 单位</p>
            </section>
            <section className={styles.contextSection}>
              <h3>模型</h3>
              <p>{model || "未选择"}</p>
            </section>
            <section className={styles.contextSection}>
              <h3>知识检索</h3>
              <label className={styles.knowledgeToggle}>
                <input
                  type="checkbox"
                  checked={knowledgeEnabled}
                  onChange={(event) => onKnowledgeChange(event.target.checked)}
                />
                <span>{knowledgeEnabled ? "已开启" : "已关闭"}</span>
              </label>
              {lastKnowledgeHits !== null && (
                <p className={styles.knowledgeHits}>上次回答检索到 {lastKnowledgeHits} 个资料片段</p>
              )}
            </section>
            <section className={styles.contextSection}>
              <h3>长期记忆</h3>
              {activeMode === "group" ? (
                <p className={styles.knowledgeHits}>
                  群聊满 15 条后自动为每位成员整理记忆，后续群聊会携带各自经历。
                </p>
              ) : memoryState === "generating" ? (
                <p className={styles.knowledgeHits}>正在整理这段对话的记忆…</p>
              ) : memoryState === "error" ? (
                <p className={styles.knowledgeHits}>记忆整理失败，下轮对话会重试。</p>
              ) : memorySummary ? (
                <>
                  <p className={styles.memorySummary}>
                    {memorySummary.length > 220 ? `${memorySummary.slice(0, 220)}…` : memorySummary}
                  </p>
                  <button className={styles.clearMemory} type="button" onClick={onClearMemory}>
                    清除这段记忆
                  </button>
                </>
              ) : (
                <p className={styles.knowledgeHits}>对话足够长后会自动沉淀为角色记忆。</p>
              )}
            </section>
            <section className={styles.contextSection}>
              <h3>用量</h3>
              <p>
                输入 {totalUsage.prompt} · 输出 {totalUsage.completion}
              </p>
            </section>
            {activePersona && (
              <section className={styles.contextSection}>
                <h3>角色设定摘要</h3>
                <p>{activePersona.description}</p>
              </section>
            )}
            {activeMode === "group" && cast.length > 0 && (
              <section className={styles.contextSection}>
                <h3>群聊成员</h3>
                {worldTitle && <p className={styles.knowledgeHits}>世界：{worldTitle}</p>}
                {cast.map((persona) => (
                  <p className={styles.castMember} key={persona.id}>
                    {persona.avatar || "🎭"} {persona.name}：{persona.description.slice(0, 60)}
                    {persona.description.length > 60 ? "…" : ""}
                  </p>
                ))}
              </section>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
