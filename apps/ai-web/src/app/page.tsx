"use client";

import { Bot, Coins, Download, KeyRound, LogIn, LogOut, PanelLeft, Plus, ReceiptText, Send, ShieldCheck, SlidersHorizontal, Sparkles, Square, Theater, Trash2, User } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/drawer";
import { PersonaSetup } from "@/components/persona-setup";
import { ConversationSidebar } from "@/components/sidebar";
import { personaSystemPrompt, PRESET_PERSONAS, type Persona } from "@/lib/personas";

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
	mode: "chat" | "roleplay";
	personaName?: string;
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
	const [toolsTab, setToolsTab] = useState<"ledger" | "keys" | "quota">("ledger");
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [activeMode, setActiveMode] = useState<"chat" | "roleplay">("chat");
	const [activePersona, setActivePersona] = useState<Persona | undefined>();
	const [personas, setPersonas] = useState<Persona[]>([]);
	const [setupOpen, setSetupOpen] = useState(false);
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
				if (Array.isArray(detail.messages)) {
					setMessages(detail.messages);
					setActiveMode(detail.mode === "roleplay" ? "roleplay" : "chat");
					setActivePersona(detail.persona ?? undefined);
				}
			} else {
				await ensureConversation();
			}
		} catch {}
	}

	async function loadPersonas() {
		try {
			const response = await fetch("/api/personas", { cache: "no-store" });
			if (response.ok) {
				const body = await response.json();
				setPersonas(Array.isArray(body.personas) ? body.personas : []);
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

	async function loadKeys() {
		try {
			const response = await fetch("/api/me/keys", { cache: "no-store" });
			if (response.ok) {
				const body = await response.json();
				setKeys(Array.isArray(body.keys) ? body.keys : []);
			}
		} catch {}
	}

	async function openTools(tab: "ledger" | "keys" | "quota") {
		setToolsTab(tab);
		setToolsOpen(true);
		if (tab === "ledger") await loadLedger();
		if (tab === "keys") await loadKeys();
	}

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

	async function openConversation(id: string) {
		if (!id || id === conversationId) return;
		abortRef.current?.abort();
		const detail = await fetch(`/api/chat/conversations/${id}`, { cache: "no-store" }).then((response) => response.json());
		if (Array.isArray(detail.messages)) {
			setConversationId(id);
			setMessages(detail.messages);
			setActiveMode(detail.mode === "roleplay" ? "roleplay" : "chat");
			setActivePersona(detail.persona ?? undefined);
			setError("");
		}
	}

	function openNewConversationSetup() {
		abortRef.current?.abort();
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
		if (!response.ok || !body?.conversation?.id) {
			throw new Error(body?.error || "创建会话失败。");
		}
		setConversationId(body.conversation.id);
		setConversations((current) => [body.conversation, ...current]);
		setMessages([]);
		setActiveMode("chat");
		setActivePersona(undefined);
		setError("");
		setSetupOpen(false);
	}

	async function startRoleplayConversation(persona: Persona, saveToLibrary: boolean) {
		let target = persona;
		if (saveToLibrary) {
			const response = await fetch("/api/personas", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ persona }),
			});
			const body = await response.json().catch(() => null);
			if (!response.ok || !body?.persona?.id) {
				throw new Error(body?.error || "保存角色失败。");
			}
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
		if (!response.ok || !body?.conversation?.id) {
			throw new Error(body?.error || "创建会话失败。");
		}
		setConversationId(body.conversation.id);
		setConversations((current) => [body.conversation, ...current]);
		setMessages([]);
		setActiveMode("roleplay");
		setActivePersona(target);
		setError("");
		setSetupOpen(false);
	}

	async function deleteLibraryPersona(id: string) {
		const response = await fetch(`/api/personas/${id}`, { method: "DELETE" });
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			throw new Error(body?.error || "删除角色失败。");
		}
		setPersonas((current) => current.filter((persona) => persona.id !== id));
	}

	async function deleteConversationById(id: string) {
		if (!window.confirm("删除该会话？此操作不可恢复。")) return;
		await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
		if (id === conversationId) {
			setConversationId(null);
			setMessages([]);
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
    const systemMessages: { role: "system"; content: string }[] =
      activeMode === "roleplay" && activePersona
        ? [{ role: "system", content: personaSystemPrompt(activePersona) }]
        : [];
    const requestMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      ...systemMessages,
      ...messages,
      userMessage,
    ].map(({ role, content: messageContent }) => ({ role, content: messageContent }));
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
        <div className="workspace-grid">
          <ConversationSidebar
            conversations={conversations}
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
            onDelete={(id) => {
              void deleteConversationById(id);
            }}
            onExport={(id) => {
              void exportConversationById(id);
            }}
          />
          <section className="chat-workspace">
          <div className="chat-toolbar">
            <div className="identity">
              <button className="sidebar-toggle" type="button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="会话列表">
                <PanelLeft size={18} aria-hidden="true" />
              </button>
              <span className="avatar"><User size={17} aria-hidden="true" /></span>
              <span><strong>{session.identity.name}</strong><small>#{session.subject.userId}</small></span>
            </div>
				<div className="toolbar-filters">
					{activePersona && (
						<span className="persona-chip" title={`当前角色：${activePersona.name}`}>
							{activePersona.avatar || "🎭"} {activePersona.name}
						</span>
					)}
					<span className="balance" title="公益额度（单位）">
						<small>公益额度</small>
						<strong>{balanceUnits === null ? "—" : balanceUnits}</strong>
					</span>
					<label className="model-picker">
						<span>模型</span>
						<select value={model} onChange={(event) => setModel(event.target.value)} disabled={pending}>
							{session.models.map((item) => <option value={item} key={item}>{item}</option>)}
						</select>
					</label>
				</div>
				<div className="toolbar-actions">
					<button className="icon-action" type="button" onClick={() => openTools("ledger")} title="额度与 Key" aria-label="额度与 Key">
						<SlidersHorizontal size={17} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={() => conversationId && exportConversationById(conversationId)} title="导出会话" aria-label="导出会话">
						<Download size={17} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={() => conversationId && deleteConversationById(conversationId)} title="删除会话" aria-label="删除会话">
						<Trash2 size={17} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={openNewConversationSetup} title="新对话" aria-label="新对话">
						<Plus size={18} aria-hidden="true" />
					</button>
					<button className="icon-action" type="button" onClick={logout} title="退出登录" aria-label="退出登录">
						<LogOut size={18} aria-hidden="true" />
					</button>
				</div>
			</div>

			<Drawer open={toolsOpen} title="额度与 Key" onClose={() => setToolsOpen(false)}>
				<div className="tools-tabs" role="tablist" aria-label="额度与 Key">
					<button className={toolsTab === "ledger" ? "tools-tab active" : "tools-tab"} type="button" onClick={() => openTools("ledger")}>
						<ReceiptText size={15} aria-hidden="true" /> 流水
					</button>
					<button className={toolsTab === "keys" ? "tools-tab active" : "tools-tab"} type="button" onClick={() => openTools("keys")}>
						<KeyRound size={15} aria-hidden="true" /> API Key
					</button>
					{session.identity.role === "admin" && (
						<button className={toolsTab === "quota" ? "tools-tab active" : "tools-tab"} type="button" onClick={() => openTools("quota")}>
							<Coins size={15} aria-hidden="true" /> 额度发放
						</button>
					)}
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
											<strong>{entry.entry_type} · {entry.funding_source}</strong>
											<small>{entry.reason || "—"}</small>
											<small>{entry.request_id ? `request ${entry.request_id}` : ""} · {new Date(entry.created_at * 1000).toLocaleString("zh-CN")}</small>
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
								<input type="text" maxLength={50} value={keyForm.name} onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })} required />
							</label>
							<label>
								<span>预算（额度单位）</span>
								<input type="number" min="1" value={keyForm.remainQuota} onChange={(event) => setKeyForm({ ...keyForm, remainQuota: event.target.value })} required />
							</label>
							<label>
								<span>有效期</span>
								<select value={keyForm.expiryDays} onChange={(event) => setKeyForm({ ...keyForm, expiryDays: event.target.value })}>
									<option value="7">7 天</option>
									<option value="30">30 天</option>
									<option value="90">90 天</option>
								</select>
							</label>
							<label>
								<span>模型</span>
								<div className="model-checks">
									{session.models.map((item) => (
										<label key={item} className="model-check">
											<input
												type="checkbox"
												checked={keyForm.models.includes(item)}
												onChange={(event) =>
													setKeyForm((current) => ({
														...current,
														models: event.target.checked
															? [...current.models, item]
															: current.models.filter((model) => model !== item),
													}))
												}
											/>
											<span>{item}</span>
										</label>
									))}
								</div>
							</label>
							<button className="primary-action" type="submit">创建 Key</button>
						</form>
						{createdKey && (
							<div className="one-time-key">
								<strong>请立即保存，只显示一次：</strong>
								<code>{createdKey}</code>
							</div>
						)}
						{keysError && <p className="request-error" role="alert">{keysError}</p>}
						<ul className="ledger-list">
							{keys.map((item) => (
								<li className="ledger-item" key={item.id}>
									<span className="ledger-amount">{item.status === 1 ? "启用" : "停用"}</span>
									<span className="ledger-copy">
										<strong>{item.name || "未命名"} · {item.key}</strong>
										<small>{item.model_limits || "全部模型"} · 剩余 {item.remain_quota}</small>
										<small>有效期至 {new Date(item.expired_time * 1000).toLocaleString("zh-CN")}</small>
									</span>
									<button className="icon-action" type="button" onClick={() => deleteKey(item.id)} aria-label="删除 Key">
										<Trash2 size={16} aria-hidden="true" />
									</button>
								</li>
							))}
						</ul>
					</section>
				)}

				{toolsTab === "quota" && session.identity.role === "admin" && (
					<section className="tool-section" aria-live="polite">
						<h2>公益额度发放</h2>
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
					</section>
				)}
			</Drawer>

			<PersonaSetup
				open={setupOpen}
				presets={PRESET_PERSONAS}
				library={personas}
				onClose={() => setSetupOpen(false)}
				onStartChat={startPlainConversation}
				onStartRoleplay={startRoleplayConversation}
				onDeletePersona={deleteLibraryPersona}
			/>

			<div className="conversation" aria-live="polite">
            {activePersona?.firstMessage?.trim() ? (
              <article className="message assistant">
                <span className="message-icon"><Bot size={17} /></span>
                <div>{activePersona.firstMessage}</div>
              </article>
            ) : null}
            {messages.length === 0 && !activePersona && (
              <div className="empty-state">
                <span><Bot size={24} aria-hidden="true" /></span>
                <h1>新对话</h1>
                <p>{model}</p>
                <button className="ghost-action" type="button" onClick={openNewConversationSetup}>
                  <Theater size={16} aria-hidden="true" /> 开始角色扮演
                </button>
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
        </div>
      )}
    </main>
  );
}
