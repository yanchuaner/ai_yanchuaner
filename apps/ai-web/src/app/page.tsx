"use client";

import { Bot, LogIn, LogOut, Send, ShieldCheck, Sparkles, Square, User } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

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
  const abortRef = useRef<AbortController | null>(null);

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
      })
      .catch(() => setSession({ status: "anonymous" }));
  }, []);

  async function logout() {
    abortRef.current?.abort();
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ status: "anonymous" });
    setMessages([]);
  }

  function appendAssistantContent(id: string, content: string) {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, content: message.content + content } : message)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || pending || session.status !== "authenticated" || !model) return;
    const userMessage = newMessage("user", content);
    const assistantMessage = newMessage("assistant", "");
    const requestMessages = [...messages, userMessage].map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setPrompt("");
    setError("");
    setPending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: requestMessages }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "模型请求失败。");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedContent = false;
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
              receivedContent = true;
              appendAssistantContent(assistantMessage.id, delta);
            }
          }
        }
        if (done) break;
      }
      if (!receivedContent) throw new Error("模型未返回可显示内容。");
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "模型请求失败。");
      setMessages((current) => current.filter((message) => message.id !== assistantMessage.id || message.content.length > 0));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
    }
  }

  return (
    <main className={session.status === "authenticated" ? "app-shell" : "access-shell"}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="燕中 AI 首页">
          <span className="brand-mark"><Sparkles size={18} aria-hidden="true" /></span>
          <span>燕中 AI</span>
        </a>
        <span className="phase">内部预览</span>
      </header>

      {session.status === "loading" && <div className="status-line" aria-live="polite">正在确认访问状态</div>}

      {session.status === "anonymous" && (
        <section className="access-view">
          <p className="eyebrow">YANCORE</p>
          <h1>燕中 AI 工作台</h1>
          <div className="access-panel">
            <div className="access-copy">
              <ShieldCheck size={22} aria-hidden="true" />
              <div>
                <h2>主站统一身份</h2>
                <p>面向已认证在校生、校友、教师与管理员开放。</p>
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
        <section className="chat-workspace">
          <div className="chat-toolbar">
            <div className="identity">
              <span className="avatar"><User size={17} aria-hidden="true" /></span>
              <span><strong>{session.identity.name}</strong><small>#{session.subject.userId}</small></span>
            </div>
            <label className="model-picker">
              <span>模型</span>
              <select value={model} onChange={(event) => setModel(event.target.value)} disabled={pending}>
                {session.models.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
            <button className="icon-action" type="button" onClick={logout} title="退出登录" aria-label="退出登录">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="conversation" aria-live="polite">
            {messages.length === 0 && (
              <div className="empty-state">
                <span><Bot size={24} aria-hidden="true" /></span>
                <h1>新对话</h1>
                <p>{model}</p>
              </div>
            )}
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span className="message-icon">{message.role === "user" ? <User size={17} /> : <Bot size={17} />}</span>
                <div>{message.content || <span className="thinking">正在生成</span>}</div>
              </article>
            ))}
          </div>

          <div className="composer-wrap">
            {error && <p className="request-error" role="alert">{error}</p>}
            <form className="composer" onSubmit={submit}>
              <textarea
                aria-label="消息"
                placeholder="输入消息"
                rows={2}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={pending}
              />
              {pending ? (
                <button className="send-action stop" type="button" onClick={() => abortRef.current?.abort()} title="停止生成" aria-label="停止生成">
                  <Square size={17} fill="currentColor" />
                </button>
              ) : (
                <button className="send-action" type="submit" disabled={!prompt.trim() || !model} title="发送" aria-label="发送">
                  <Send size={18} />
                </button>
              )}
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
