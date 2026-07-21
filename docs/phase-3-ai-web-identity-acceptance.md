# 阶段 3D：自主 AI Web 身份与主体交换验收

更新日期：2026-07-21

## 目标

证明自主 `apps/ai-web` 不依赖 Open WebUI 身份或会话实现，能够从主站 OIDC 登录一路完成 YanCore 主体交换，并只在服务端持有短期应用 Key。该路径使用独立 `ai-web-yanchuaner` 客户端，回调为 `/api/auth/callback`；Open WebUI 继续使用另一个客户端和 `/oauth/oidc/callback`。

## 验收条件

- 登录请求包含 S256 PKCE、state、nonce、`openid profile email` 和精确回调；
- ID Token 的 audience 绑定自主客户端，主站 access token 只由 AI BFF 提交给燕中 API；
- 燕中 API 通过固定 UserInfo 地址复验主体，只映射已存在的 `yanchuaner` OAuth 绑定，不在交换接口自动建号；
- 同一校友重复登录复用同一主站 `sub` 和 API user ID；
- 每次登录签发最长 15 分钟、50000 额度单位、仅允许 `gpt-4.1-mini` 与 `deepseek-chat` 的应用 Key；
- `/api/session` 只返回身份、主体、模型、额度和过期时间，不返回主站 token、YanCore grant 或 `sk-yc_` Key；
- 匿名 `/api/session` 返回 401，配置或交换失败时不创建浏览器会话。

## 自动化与数据边界

运行 `scripts/verify-ai-web-identity.ps1 -AllowLocalMutation`。脚本默认只接受 `localhost:3000` 与 `localhost:3002`，会创建短期 grant、应用 Key、登录审计和 Token 记录，因此只能连接隔离数据库。输出不得包含授权码、Cookie、主站 token、grant、应用 Key 或任何客户端 Secret。

## 回滚

关闭 `YANCHUANER_SUBJECT_EXCHANGE_ENABLED` 并停止 `ai-web` profile。已签发的 grant 和应用 Key 最长 15 分钟后失效；不删除 API 用户、OAuth 绑定、额度流水或用量日志。Open WebUI 过渡客户端继续使用自己的受限服务账户，不继承自主 AI Web 的个人主体。
