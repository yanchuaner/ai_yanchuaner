# Staging Readiness Gate

阶段 4B 在真实供应商和 HTTPS 环境切换前执行配置门禁。检查脚本不会打印 Secret，也不会发起模型调用。

> 状态更新（2026-08-17）：预算耗尽、失败退款、限流、凭证撤销与断流已由 `docs/ai-61-real-gateway-acceptance.md` 真实验收；本文保留历史门禁检查项。仍待：跨供应商故障切换、Open WebUI 逐用户归因（已转内网）。

## 检查内容

- AI Web、主站 OIDC、OIDC discovery、OAuth callback、Open WebUI 和 CORS 使用 HTTPS。
- AI Web、New API、Open WebUI 使用互不相同的 OAuth client ID 和 Secret。
- staging 禁止 `AI_WEB_ALLOW_INSECURE_INTERNAL_HTTP=true`。
- Secret 不得为 `.env.example` 占位文本，且满足最小长度。
- LiteLLM 管理端仅绑定 `127.0.0.1` 或 `localhost`。
- 至少配置一个真实的 OpenAI 或 DeepSeek 凭据，供应商地址必须为 HTTPS。
- Docker Compose 配置可解析。

## 使用

在部署主机上将 Secret 注入被保护的 `.env` 或 Secret 管理器映射文件，然后执行：

```powershell
pwsh ./scripts/check-staging-readiness.ps1 -EnvFile ./.env
```

本地只验证 URL、Secret 和 OAuth 隔离而不要求 Docker 时：

```powershell
pwsh ./scripts/check-staging-readiness.ps1 -EnvFile ./.env -SkipComposeConfig
```

通过门禁不代表供应商授权、OIDC 用户流程、退款、备份恢复或性能验收已经完成；这些仍需在 staging 执行独立验收脚本。

## 当前预览状态

截至 2026-08-12，`yanchuaner.cn` 是唯一身份提供方，`api.yanchuaner.cn` 与 `ai.yanchuaner.cn` 均已改用主域；`staging.yanchuaner.cn` 的 OAuth/OIDC 签发已关闭。自主 ai-web 已上线 `ai.yanchuaner.cn`，通过主站 OIDC、YanCore 主体交换和 DeepSeek 真实对话完成验收；Open WebUI 保留在 `127.0.0.1:3001` 仅作过渡/内网管理。

项目负责人已确认普通成员主域登录通过。主站账号停用/角色变化已接入签名身份事件同步：API 收到事件后幂等撤销存量 grant 与 Token（本地隔离环境已验证，2026-08-12 已随主站、API 发布到生产），自主 ai-web 在上游返回 401/403 时立即清除会话。以下项目仍不得标记为完成：Open WebUI 逐用户请求归因（已转内网），预算耗尽、失败退款、TPM 超限，以及跨供应商故障切换。管理员与普通成员回调通过不能替代这些计费和撤销门禁。
