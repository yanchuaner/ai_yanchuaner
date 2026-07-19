"use client";

import { LogIn, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | {
      status: "authenticated";
      identity: { name: string; role: string };
      subject: { userId: number; scopes: string; audience: string };
      expiresAt: number;
    };

export default function HomePage() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return setSession({ status: "anonymous" });
        const body = await response.json();
        setSession({ status: "authenticated", identity: body.identity, subject: body.subject, expiresAt: body.expiresAt });
      })
      .catch(() => setSession({ status: "anonymous" }));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ status: "anonymous" });
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="燕中 AI 首页">
          <span className="brand-mark"><Sparkles size={18} aria-hidden="true" /></span>
          <span>燕中 AI</span>
        </a>
        <span className="phase">内部预览</span>
      </header>

      <section className="workspace" aria-live="polite">
        <div className="workspace-heading">
          <p className="eyebrow">YANCORE</p>
          <h1>属于燕中人的 AI 工作台</h1>
          <p>由燕中校友汇公益创办，统一使用主站认证与公益额度。</p>
        </div>

        {session.status === "loading" && <div className="status-line">正在确认访问状态</div>}

        {session.status === "anonymous" && (
          <div className="access-panel">
            <div className="access-copy">
              <ShieldCheck size={22} aria-hidden="true" />
              <div>
                <h2>主站统一身份</h2>
                <p>仅向已认证在校生、校友、教师与管理员开放。</p>
              </div>
            </div>
            <a className="primary-action" href="/api/auth/login">
              <LogIn size={18} aria-hidden="true" />
              使用主站账号登录
            </a>
          </div>
        )}

        {session.status === "authenticated" && (
          <div className="access-panel authenticated">
            <div className="access-copy">
              <ShieldCheck size={22} aria-hidden="true" />
              <div>
                <h2>{session.identity.name}</h2>
                <p>YanCore 主体 #{session.subject.userId} · {session.subject.audience}</p>
              </div>
            </div>
            <dl className="session-facts">
              <div><dt>权限</dt><dd>{session.subject.scopes}</dd></div>
              <div><dt>凭证有效至</dt><dd>{new Date(session.expiresAt * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</dd></div>
            </dl>
            <button className="icon-action" type="button" onClick={logout} title="退出登录" aria-label="退出登录">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
