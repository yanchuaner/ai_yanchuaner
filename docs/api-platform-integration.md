# AI 使用层与统一 API 网关集成

本文定义 `ai_yanchuaner` 如何消费 `api.yanchuaner.cn`。稳定语义以工作区 `docs/contracts.md` 为准。

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

AI 使用层只依赖公开网关。LiteLLM、New API 内部渠道、供应商 Key 和控制面数据库均不可见。

## 身份与凭据

1. 浏览器通过主站 OIDC Authorization Code + S256 PKCE 登录。
2. AI BFF 使用独立交换客户端，把主站短期令牌提交给 YanCore。
3. API 复验 UserInfo，返回限定 `subject`、`application`、`audience`、scope、模型/能力和预算的短期 grant 与应用 Key。
4. BFF 把凭据放入加密 HttpOnly Cookie；浏览器只读取脱敏会话信息。
5. API 返回 401/403 时，BFF 立即清除会话并停止能力调用。

OIDC client Secret、YanCore exchange Secret 和应用 Key 分域管理，不得复用。

## 模型与能力调用

- 文本和嵌入调用都经统一网关，由 API 执行策略、预扣、路由、结算和审计。
- AI 传递 `client_request_id` 与 `trace_id`，保留网关响应的 `request_id`。
- AI 展示网关返回的标准化 usage 和余额投影，不自行扣减或修正余额。
- 供应商或渠道切换只发生在 API/设施层；AI 默认工作流最终使用稳定能力 ID。
- 兼容期可使用公开模型别名，但不得读取内部渠道 ID 或 LiteLLM 模型配置。

## 失败与重试

| 错误 | AI 行为 |
| --- | --- |
| 会话撤销/未认证 | 清除 Cookie，要求重新登录 |
| scope/模型不允许 | 保持会话，提示能力不可用，不换渠道绕过 |
| 额度不足 | 展示余额入口，不自动重试 |
| RPM/TPM/并发 | 遵循 `Retry-After`，避免并发重放 |
| 上游不可用/超时 | 同一 `client_request_id` 在 BFF 侧去重：网关明确错误（未计费/已退款）允许重试；结果未知或已计费时返回 409，TTL 内不重复进入网关 |
| SSE 断连 | 发出取消信号；最终计费由 API 状态决定 |
| RAG 降级 | 可继续无知识对话，但记录并显示降级状态 |

AI 不根据错误文案分支；兼容旧接口时由 YanCore adapter 映射稳定错误码。

## Open WebUI 与 LiteLLM

- Open WebUI 只保留为内网兼容/回退客户端，使用独立服务账户，不继承个人主体或公益额度。
- LiteLLM 只作为内部设施适配器和成本核对工具，不是用户账本，也不向 AI Web 提供公共 API。
- 两者的管理端口不开放公网，数据与自主 AI 会话分离。
- 移除或替换任一组件时保持 YanCore 和 `/v1` 对外契约不变。

## 契约测试

集成至少覆盖：

- 主体交换、受众与 scope 拒绝；
- 应用 Key 只显示一次、过期和撤销；
- 普通与 SSE 请求的 request/trace 传播；
- 文本和嵌入能力权限；
- 额度预扣、结算、退款和待对账；
- 预算、RPM、TPM、并发与 Redis 故障；
- AI 对稳定错误码的界面行为；
- 浏览器响应不含 grant、Key 或供应商字段。

本机 fixture 证明协议行为，不等于真实供应商和生产结算验收。
