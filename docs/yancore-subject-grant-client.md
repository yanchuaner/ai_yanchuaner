# YanCore Subject Grant 客户端契约

更新日期：2026-07-19
状态：`PHASE_1_ADAPTER_CONTRACT`

## 定位

YanCore Subject Grant 是燕中自己的主体授权协议。它由 `api_yanchuaner` 签发，供燕中 AI、YCZX Code 和后续 Agent 使用。Open WebUI、LiteLLM 和 New API 都不是该协议的权利主体，也不定义 `application`、`audience` 或 `scopes` 的业务含义。

## 调用步骤

1. 用户通过主站 OIDC 登录燕中 API。
2. API 为具体应用签发短期 grant，例如 `application=ai-web`、`audience=yanchuaner-ai`。
3. 客户端在服务端安全保存 grant，不写入浏览器日志、聊天内容或模型请求正文。
4. 客户端向 API 的 `/api/yancore/grants/introspect` 发送 `Authorization: Bearer <grant>`，请求体必须包含期望的 `audience`。
5. 控制面返回主体、应用、受众、scope 和过期时间后，客户端再创建带 `request_id` 的模型请求。

## 过渡配置

```env
YANCORE_API_BASE_URL=https://api.yanchuaner.cn
YANCORE_AUDIENCE=yanchuaner-ai
YANCORE_APPLICATION=ai-web
```

`OPENWEBUI_API_KEY` 仍是过渡服务账户凭据，仅可用于系统级健康检查或尚未完成主体透传的兼容路径。它不能代表个人用户，也不能直接扣减个人公益额度。

## 安全规则

- grant TTL 由调用方选择短值，普通工作台建议不超过 15 分钟；
- 受众不匹配必须拒绝，不能把一个应用的 grant 转交另一个应用；
- grant 撤销或 introspection 失败时停止模型调用；
- 日志只保留 grant 的哈希/请求 ID，不保留 JWT 正文；
- 客户端不复制 New API Token 验证、LiteLLM 预算或 Open WebUI 会话实现。

## 当前限制

本仓库目前只有编排和第三方镜像，没有自主 Web 应用进程，因此该文件先作为跨仓库契约。下一步应在 `apps/ai-web` 建立燕中自己的入口和会话服务，再将 Open WebUI 作为可选的过渡客户端。
