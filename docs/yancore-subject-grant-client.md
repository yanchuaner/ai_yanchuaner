# YanCore Subject Grant 客户端契约

更新日期：2026-07-19
状态：`AI_WEB_BFF_IMPLEMENTED`

## 定位

YanCore Subject Grant 是燕中自己的主体授权协议。它由 `api_yanchuaner` 签发，供燕中 AI、YCZX Code 和后续 Agent 使用。Open WebUI、LiteLLM 和 New API 都不是该协议的权利主体，也不定义 `application`、`audience` 或 `scopes` 的业务含义。

## 调用步骤

1. 用户通过主站 OIDC 登录燕中 AI Web，客户端库校验 state、nonce、PKCE 和 ID Token。
2. AI Web BFF 使用独立服务客户端凭据，把短期主站访问令牌提交到 `/api/yancore/subject-exchange`。
3. API 通过固定 UserInfo 地址复验身份并映射已绑定用户，签发 `application=ai-web`、`audience=yanchuaner-ai` 的短期 grant。
4. AI Web 将 grant 放入 AES-256-GCM 加密 HttpOnly Cookie，不写入浏览器日志、聊天内容或模型请求正文。
5. 后续模型代理向 API 的 `/api/yancore/grants/introspect` 声明期望 `audience`，并创建带 `request_id` 的模型请求。

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

`apps/ai-web` 已实现登录到主体 grant。当前尚未实现 grant 到模型转发、额度扣减与调用审计的适配，因此不能宣称个人 AI 调用闭环完成；Open WebUI 继续作为独立 PoC 客户端，不继承自主 AI Web 的原创声明。
