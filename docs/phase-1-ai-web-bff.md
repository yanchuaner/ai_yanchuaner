# 阶段 1：自主 AI Web/BFF

更新日期：2026-07-19
状态：`LOGIN_TO_SUBJECT_GRANT_IMPLEMENTED`

## 目标

`apps/ai-web` 是燕中自主设计和实现的产品入口，不复制 Open WebUI 的页面、会话或后端。首个增量只解决一个边界清晰的闭环：主站 OIDC 登录、ID Token 校验、YanCore 主体交换、加密会话与当前主体展示。

## 数据流

```text
浏览器
  -> 燕中 AI Web /api/auth/login
  -> 主站 OIDC 授权码 + PKCE + state + nonce
  -> 燕中 AI Web /api/auth/callback
  -> 燕中 API /api/yancore/subject-exchange
  -> 主站固定 UserInfo 端点复验短期访问令牌
  -> 已绑定 yanchuaner OAuth 的 API 用户
  -> 15 分钟 YanCore Subject Grant
  -> AES-256-GCM 加密 HttpOnly Cookie
```

浏览器只能读取脱敏会话摘要，不能读取主站访问令牌、YanCore grant、OIDC Client Secret 或交换客户端 Secret。

## 模块边界

| 模块 | 责任 |
| --- | --- |
| `src/lib/oidc.ts` | 发现文档校验、授权码 + PKCE、state/nonce 和 ID Token 校验 |
| `src/lib/yancore.ts` | 使用独立服务客户端凭据交换 YanCore grant |
| `src/lib/session.ts` | AES-256-GCM 密封、Cookie 参数、过期与结构校验 |
| `src/app/api/auth/**` | 登录、回调和退出命令 |
| `src/app/api/session` | 只返回脱敏主体和过期时间 |
| `src/app/page.tsx` | 燕中自主品牌入口和当前访问状态 |

## 安全约束

- 生产公开 URL、Issuer 和外部 OIDC 端点必须使用 HTTPS；本地明文内部 HTTP 必须显式开启；
- 登录事务 5 分钟过期，YanCore grant 最长 15 分钟；
- 会话 Cookie 为 `HttpOnly + SameSite=Lax`，HTTPS 时强制 `Secure`；
- Cookie 密文使用随机 96 位 IV 和 AES-256-GCM 认证标签；篡改、过期或结构错误一律按未登录处理；
- 应用不保存聊天正文，不记录令牌和完整请求头；
- `openid-client` 负责协议和 ID Token 验证，自主代码只定义燕中业务会话与交换边界。

## 当前限制

- 交换只映射已在燕中 API 绑定 `yanchuaner` OAuth 的用户，不按邮箱自动合并或静默创建账户；
- 尚未把 YanCore grant 接入模型代理、虚拟 Key、额度预扣/结算和调用审计；
- Open WebUI 仍保留为默认 PoC，`ai-web` 通过 Compose `yancore` profile 在 3002 独立验收；真实调用闭环通过前不切换 3001 流量。

## 验收与回滚

验收：TypeScript 类型检查、会话篡改/过期测试、Next 生产构建、Compose 配置、桌面 1280x720 与移动 390x844 无溢出。

回滚：停止 `ai-web` profile 并关闭 API 的 `YANCHUANER_SUBJECT_EXCHANGE_ENABLED`。Open WebUI、LiteLLM 和现有数据不迁移、不删除；已签发 grant 最迟 15 分钟自然失效。

## 下一增量

在 API 控制面增加 YanCore grant 到受限虚拟 Key/请求主体的适配层，再由 AI BFF 实现 SSE 模型代理。验收必须覆盖：真实 OpenAI/DeepSeek 调用、公益额度预扣与结算、失败退款、request_id 贯穿和用户审计查询。
