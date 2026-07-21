# YanCore Subject Grant 客户端契约

更新日期：2026-07-19
状态：`AI_WEB_BFF_IMPLEMENTED`

## 定位

YanCore Subject Grant 是燕中自己的主体授权协议。它由 `api_yanchuaner` 签发，供燕中 AI、YCZX Code 和后续 Agent 使用。Open WebUI、LiteLLM 和 New API 都不是该协议的权利主体，也不定义 `application`、`audience` 或 `scopes` 的业务含义。

## 调用步骤

1. 用户通过主站 OIDC 登录燕中 AI Web，客户端库校验 state、nonce、PKCE 和 ID Token。
2. AI Web BFF 使用独立服务客户端凭据，把短期主站访问令牌提交到 `/api/yancore/subject-exchange`。
3. API 通过固定 UserInfo 地址复验身份并映射已绑定用户，签发 `application=ai-web`、`audience=yanchuaner-ai` 的短期 grant，以及只展示一次的应用会话 Key。
4. Key 固定 15 分钟、有限预算和精确模型白名单；数据库只保存哈希。再次登录软删除旧 Key，避免长期堆积或旧浏览器继续调用。
5. AI Web 将 grant 与 Key 放入 AES-256-GCM 加密 HttpOnly Cookie，不写入浏览器日志、聊天内容或模型请求正文；`/api/session` 只返回主体、模型和非敏感预算元数据。
6. BFF 以应用 Key 调用燕中 API `/v1/chat/completions`，由标准 TokenAuth、模型权限、公益额度结算和用量日志完成逐用户归因。

## 过渡配置

```env
YANCORE_API_BASE_URL=https://api.yanchuaner.cn
YANCORE_AUDIENCE=yanchuaner-ai
YANCORE_APPLICATION=ai-web
YANCORE_SUBJECT_EXCHANGE_CLIENT_ID=ai-yancore-bff
```

`OPENWEBUI_API_KEY` 仍是过渡服务账户凭据，仅可用于系统级健康检查或尚未完成主体透传的兼容路径。它不能代表个人用户，也不能直接扣减个人公益额度。

## 安全规则

- grant TTL 由调用方选择短值，普通工作台建议不超过 15 分钟；
- 受众不匹配必须拒绝，不能把一个应用的 grant 转交另一个应用；
- grant 撤销或 introspection 失败时停止模型调用；
- 日志只保留 grant 的哈希/请求 ID，不保留 JWT 正文；
- 客户端不复制 New API Token 验证、LiteLLM 预算或 Open WebUI 会话实现。

## 当前限制

`apps/ai-web` 已实现登录到逐用户模型调用的代码闭环，但生产结论仍以真实 OpenAI/DeepSeek、失败退款、request ID 和用户日志查询验收为准。Open WebUI 继续作为独立服务账户 PoC 客户端，不继承自主 AI Web 的原创声明。
