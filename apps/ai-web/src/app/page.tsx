"use client";

import { Bot, Coins, Download, LogIn, LogOut, Plus, ReceiptText, Send, ShieldCheck, Sparkles, Square, Trash2, User, X } from "lucide-react";
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
  requestId?: string;
	usage?: { prompt: number; completion: number };
};

type ConversationSummary = {
	id: string;
	title: string;
	updatedAt: number;
	messageCount: number;
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
	const [ledgerVisible, setLedgerVisible] = useState(false);
	const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
	const [ledgerTotal, setLedgerTotal] = useState(0);
	const [quotaVisible, setQuotaVisible] = useState(false);
	const [quotaForm, setQuotaForm] = useState({ userId: "", action: "grant", amount: "", reason: "", reference: "" });
	const [quotaResult, setQuotaResult] = useState("");
	const [quotaError, setQuotaError] = useState("");
	const abortRef = useRef<AbortController | null>(null);

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
        return body.conversation.id;
      }
    } catch {}
    return null;
  }

	async function loadConversations() {
		try {
			const list = await fetch("/api/chat/conversations", { cache: "no-store" }).then((response) => response.json());
			const items = Array.isArray(list.conversations) ? list.conversations : [];
			setConversations(items);
			const latest = items[0];
			if (latest?.id) {
				setConversationId(latest.id);
				const detail = await fetch(`/api/chat/conversations/${latest.id}`, { cache: "no-store" }).then((response) => response.json());
        if (Array.isArray(detail.messages)) setMessages(detail.messages);
      } else {
        await ensureConversation();
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

	async function toggleLedger() {
		if (!ledgerVisible) {
			await loadLedger();
			setLedgerVisible(true);
		} else {
			setLedgerVisible(false);
		}
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

	async function openConversation(id: string) {
		if (!id || id === conversationId) return;
		abortRef.current?.abort();
		const detail = await fetch(`/api/chat/conversations/${id}`, { cache: "no-store" }).then((response) => response.json());
		if (Array.isArray(detail.messages)) {
			setConversationId(id);
			setMessages(detail.messages);
			setError("");
		}
	}

	async function newConversation() {
		abortRef.current?.abort();
		const created = await fetch("/api/chat/conversations", { method: "POST", cache: "no-store" }).then((response) => response.json());
		if (created.conversation?.id) {
			setConversationId(created.conversation.id);
			setConversations((current) => [created.conversation, ...current]);
			setMessages([]);
			setError("");
		}
	}

	async function deleteCurrentConversation() {
		if (!conversationId || !window.confirm("删除当前会话？此操作不可恢复。")) return;
		await fetch(`/api/chat/conversations/${conversationId}`, { method: "DELETE" });
		setConversationId(null);
		setMessages([]);
		await loadConversations();
	}

	async function exportCurrentConversation() {
		if (!conversationId) return;
		const response = await fetch(`/api/chat/conversations/${conversationId}/export`);
		if (!response.ok) return;
		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `yanchuaner-ai-conversation-${conversationId}.json`;
		link.click();
		URL.revokeObjectURL(url);
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
    const targetConversationId = await ensureConversation();
    if (!targetConversationId) {
      setError("会话初始化失败，请刷新后重试。");
      return;
    }
    const requestMessages = [...messages, userMessage].map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setPrompt("");
    setError("");
    setPending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await fetch(`/api/chat/conversations/${targetConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userMessage.id, role: "user", content }),
      });
      const response = await fetch("/api/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: requestMessages }),
        signal: controller.signal,
      });
      const requestId = response.headers.get("x-request-id") || "";
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
				<div className="toolbar-filters">
					<span className="balance" title="公益额度（单位）">
						<small>公益额度</small>
						<strong>{balanceUnits === null ? "—" : balanceUnits}</strong>
					</span>
					<label className="conversation-picker">
						<span>会话</span>
						<select value={conversationId ?? ""} onChange={(event) => openConversation(event.target.value)} disabled={pending}>
							{conversations.map((item) => (
								<option value={item.id} key={item.id}>{item.title}</option>
							))}
						</select>
					</label>
					<label className="model-picker">
						<span>模型</span>
						<select value={model} onChange={(event) => setModel(event.target.value)} disabled={pending}>
							{session.models.map((item) => <option value={item} key={item}>{item}</option>)}
						</select>
					</label>
				</div>
				<div className="toolbar-actions">
					{session.identity.role === "admin" && (
						<button className="icon-action" type="button" onClick={() => setQuotaVisible(!quotaVisible)} title="额度发放" aria-label="额度发放">
							<Coins size={17} aria-hidden="true" />
						</button>
					)}
					<button className="icon-action" type="button" onClick={toggleLedger} title="额度流水" aria-label="额度流水">
						<ReceiptText size={17} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={exportCurrentConversation} title="导出会话" aria-label="导出会话">
						<Download size={17} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={deleteCurrentConversation} title="删除会话" aria-label="删除会话">
						<Trash2 size={17} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={newConversation} title="新对话" aria-label="新对话">
						<Plus size={18} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={logout} title="退出登录" aria-label="退出登录">
						<LogOut size={18} aria-hidden="true" />
					</button>
				</div>
			</div>

			{quotaVisible && session.identity.role === "admin" && (
				<div className="quota-panel" aria-live="polite">
					<div className="ledger-head">
						<strong>公益额度发放</strong>
						<button className="icon-action" type="button" onClick={() => setQuotaVisible(false)} aria-label="关闭额度发放">
							<X size={16} aria-hidden="true" />
						</button>
					</div>
					<form className="quota-form" onSubmit={submitQuota}>
						<label>
							<span>目标用户 ID</span>
							<input type="number" min="1" value={quotaForm.userId} onChange={(event) => setQuotaForm({ ...quotaForm, userId: event.target.value })} required />
						</label>
						<label>
							<span>操作</span>
							<select value={quotaForm.action} onChange={(event) => setQuotaForm({ ...quotaForm, action: event.target.value })}>
								<option value="grant">发放（只允许正数）</option>
								<option value="adjust">调整（可回退）</option>
							</select>
						</label>
						<label>
							<span>金额（额度单位）</span>
							<input type="number" value={quotaForm.amount} onChange={(event) => setQuotaForm({ ...quotaForm, amount: event.target.value })} required />
						</label>
						<label>
							<span>原因</span>
							<input type="text" maxLength={200} value={quotaForm.reason} onChange={(event) => setQuotaForm({ ...quotaForm, reason: event.target.value })} required />
						</label>
						<label>
							<span>线下收款凭证</span>
							<input type="text" maxLength={128} value={quotaForm.reference} onChange={(event) => setQuotaForm({ ...quotaForm, reference: event.target.value })} required />
						</label>
						<button className="primary-action" type="submit">确认发放</button>
					</form>
					{quotaError && <p className="request-error" role="alert">{quotaError}</p>}
					{quotaResult && <p className="quota-success">{quotaResult}</p>}
				</div>
			)}

			{ledgerVisible && (
				<div className="ledger-panel" aria-live="polite">
					<div className="ledger-head">
						<strong>额度流水（{ledgerTotal}）</strong>
						<button className="icon-action" type="button" onClick={() => setLedgerVisible(false)} aria-label="关闭流水">
							<X size={16} aria-hidden="true" />
						</button>
					</div>
					{ledgerEntries.length === 0 ? (
						<p className="status-line">暂无流水记录</p>
					) : (
						<ul className="ledger-list">
							{ledgerEntries.map((entry) => (
								<li className="ledger-item" key={entry.id}>
									<span className="ledger-amount">{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</span>
									<span className="ledger-copy">
										<strong>{entry.entry_type} · {entry.funding_source}</strong>
										<small>{entry.reason || "—"}</small>
										<small>{entry.request_id ? `request ${entry.request_id}` : ""} · {new Date(entry.created_at * 1000).toLocaleString("zh-CN")}</small>
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			)}

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
                <div>
                  {message.content || <span className="thinking">正在生成</span>}
                  {message.role === "assistant" && (message.requestId || message.usage) && (
                    <small className="message-meta">
                      {message.requestId ? `request ${message.requestId}` : ""}
                      {message.usage ? ` · 输入 ${message.usage.prompt} / 输出 ${message.usage.completion}` : ""}
                    </small>
                  )}
                </div>
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
