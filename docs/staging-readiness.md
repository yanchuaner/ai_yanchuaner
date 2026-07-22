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
