# 统一 API 网关

本文定义 `ai_yanchuaner` 如何消费 `api.yanchuaner.cn`。稳定语义以生态治理仓 `docs/contracts.md` 为准；本仓不复制网关实现。

## 依赖方向

```text
AI Web / future adapter
        │ YanCore grant + application credential
        ▼
api.yanchuaner.cn
  subject / policy / capability / routing / billing / audit
        │ internal infrastructure adapter
        ▼
LiteLLM or direct provider adapter
        ▼
authorized model provider
```

## 身份与凭据

1. 浏览器通过主站 OIDC Authorization Code + S256 PKCE 登录。
2. AI BFF 使用独立交换客户端，把主站短期令牌提交给 `/api/yancore/subject-exchange`。
3. API 复验 UserInfo，返回限定 `subject`、`application=ai-web`、`audience=yanchuaner-ai`、scope、模型/能力和预算的短期 grant 与应用 Key。
4. BFF 把凭据放入加密 HttpOnly Cookie；浏览器只读取脱敏会话信息。
5. API 返回 401/403 时，BFF 立即清除会话并停止能力调用。

OIDC client Secret、YanCore exchange Secret 和应用 Key 分域管理，不得复用。

## 请求与响应头

| 头 | 方向 | 说明 |
| --- | --- | --- |
| `Authorization: Bearer <accessKey>` | AI → API | 逐登录短期应用 Key |
| `X-YanCore-Application: ai-web` | AI → API | 应用标识 |
| `X-Client-Request-ID` | 双向 | 客户端逻辑请求 ID，BFF 用于幂等去重 |
| `X-Trace-ID` | 双向 | 一次用户操作的追踪 ID |
| `X-Request-ID` / `X-Oneapi-Request-ID` | API → AI | 网关请求 ID，写入账本与消息 |

## 模型与能力调用

- 文本与嵌入调用都经统一网关，由 API 执行策略、预扣、路由、结算和审计。
- AI 展示网关返回的标准化 usage 与余额投影，不自行扣减或修正余额。
- 供应商或渠道切换只发生在 API/设施层；AI 默认工作流最终使用稳定能力 ID（见 [capability.md](capability.md)）。
- 兼容期可使用公开模型别名，但不得读取内部渠道 ID 或 LiteLLM 模型配置。

## 失败与重试

| 错误 | AI 行为 |
| --- | --- |
| 会话撤销/未认证 | 清除 Cookie，要求重新登录 |
| scope/模型不允许 | 保持会话，提示能力不可用，不换渠道绕过 |
| 额度不足 | 展示余额入口，不自动重试 |
| RPM/TPM/并发 | 不并发重放；网关错误按稳定错误码映射 |
| 上游不可用/超时 | 同一 `client_request_id` 在 BFF 侧去重：明确错误（未计费/已退款）允许重试；结果未知或已计费返回 409，TTL 内不重复进入网关 |
| SSE 断连 | 发出取消信号；最终计费由 API 状态决定 |
| RAG 降级 | 可继续无知识对话，但记录并显示降级状态 |

## Open WebUI 与 LiteLLM

- Open WebUI 只保留为内网兼容/回退客户端，使用独立服务账户，不继承个人主体或公益额度。
- LiteLLM 只作为内部设施适配器和成本核对工具，不是用户账本，也不向 AI Web 提供公共 API。
- 两者的管理端口不开放公网，数据与自主 AI 会话分离。

## 客户端实现

网关客户端位于 `apps/ai-web/src/lib/yancore-gateway.ts`、`chat.ts`、`embedding.ts`；错误码归一在 `apps/ai-web/src/lib/yancore-http-mapping.ts`。页面不直接解释上游错误文本。
