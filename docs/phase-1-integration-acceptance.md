# 阶段 1 集成验收记录

更新日期：2026-07-20
环境：Windows Docker Desktop，Docker 29.6.1，Docker Compose 5.2.0
范围：隔离功能分支工作树与全新 PostgreSQL 卷；不包含生产数据、真实供应商密钥或真实用户。

## 已通过

- LiteLLM 数据面完成 PostgreSQL 迁移并健康运行，`gateway/config.yaml` 加载 `deepseek/deepseek-v4-flash`、`deepseek/deepseek-v4-pro` 与 `gpt-image-2` 三个路由。
- New API 控制面完成 PostgreSQL 迁移、Redis 健康检查和容器健康检查。
- New API 渠道只保存 LiteLLM 受限虚拟 Key 的哈希结果；查询渠道时 `key` 为空，没有回显明文。
- API 受限服务 Key 只显示一次，数据库保存 `key_hash`、前缀和后缀；服务 Key 的模型白名单为 `deepseek-chat`、`deepseek-reasoner`、`gpt-image-2`。
- `GET /v1/models` 返回控制面公开模型名。
- 使用本机隔离的 OpenAI 兼容测试服务返回确定性文本，`deepseek-chat` 经 API 映射为 `deepseek/deepseek-v4-flash`，聊天响应成功返回。
- 同一请求在 `logs`、`quota_ledger_entries` 中使用相同 request ID；本次示例扣减 3 个额度单位，并产生 `settlement/public_benefit/-3` 不可变流水。
- 失败原因已实测可区分：测试上游停止时 API 返回上游连接错误，恢复上游后同一链路成功。

## 未通过或未完成

- 这次使用的是本机测试上游，不代表 OpenAI 或 DeepSeek 真实供应商验收。真实密钥、价格、失败退款和第二渠道仍需在受控服务器完成。
- 主站 Next.js/OIDC 端到端验收未完成。Docker Desktop 重启后，宿主 Windows 回环访问 `3000`、`4000` 出现端口代理异常；API `3101` 可访问，容器内 `api-gateway -> litellm-gateway` 网络正常。该问题应在 Linux/海外预览服务器上复验，不应通过放宽生产监听地址解决。
- 自主 AI Web 尚未接入真实主体交换，因为主站 OIDC discovery/JWKS/UserInfo 入口未在本机稳定暴露；当前代码级 OIDC、会话、模型代理和 SSE 测试仍需保留为前置证据。

## 下一步门槛

1. 在 Linux staging 主机用 HTTPS 主站完成 OIDC discovery、授权码 + PKCE、UserInfo 复验和 YanCore 主体交换。
2. 接入已获授权的 OpenAI/GPT 与 DeepSeek 渠道，分别执行普通请求、SSE、失败退款、预算耗尽、并发耗尽和 request ID 对账。
3. 确认自主 AI Web 的逐用户短期 Key 与 API 流水归属后，才允许切换 `ai.yanchuaner.cn` 流量；Open WebUI 继续作为明确标识的第三方 PoC。

## 回滚

关闭 `YANCHUANER_SUBJECT_EXCHANGE_ENABLED`，停止自主 `ai-web` profile，保留 API、LiteLLM 和数据库卷。不要执行 `down -v`，不要删除额度流水或 Token 哈希列。
