# Staging Readiness Gate

阶段 4B 在真实供应商和 HTTPS 环境切换前执行配置门禁。检查脚本不会打印 Secret，也不会发起模型调用。

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

截至 2026-08-01，`yanchuaner.cn` 是唯一身份提供方，`api.yanchuaner.cn` 与 `ai.yanchuaner.cn` 均已改用主域；`staging.yanchuaner.cn` 的 OAuth/OIDC 签发已关闭。Open WebUI 使用独立 OIDC 客户端，主站管理员已通过全新浏览器上下文复用原管理员记录；本地登录表单关闭、OAuth 自动跳转开启、密码接口返回 403。燕中 API 的受限服务 Key 已完成真实 DeepSeek 文本请求，公开预览当前仍只部署 Open WebUI 过渡客户端；自主 `ai-web` profile 继续在隔离环境验收。

项目负责人已确认普通成员主域登录通过。主站账号停用/角色变化已接入签名身份事件同步：API 收到事件后幂等撤销存量 grant 与 Token（本地隔离环境已验证，2026-08-12 已随主站、API 发布到生产），自主 AI Web 在上游返回 401/403 时立即清除会话（单测覆盖，尚未上线）。以下项目仍不得标记为完成：自主 ai-web 生产部署，Open WebUI 逐用户请求归因，预算耗尽、失败退款、TPM 超限，以及跨供应商故障切换。管理员与普通成员回调通过不能替代这些计费和撤销门禁。
