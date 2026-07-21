# 阶段 1：自主 AI Web/BFF

更新日期：2026-07-19
状态：`USER_SCOPED_CHAT_PATH_IMPLEMENTED`

## 目标

`apps/ai-web` 是燕中自主设计和实现的产品入口，不复制 Open WebUI 的页面、会话或后端。当前增量完成主站 OIDC 登录、YanCore 主体交换、短期应用 Key、加密会话、模型白名单和 SSE 对话代理；兼容网关继续承担路由、额度结算和用量日志。

自主入口固定使用 `ai-web-yanchuaner` OIDC client；Open WebUI 保留 `ai-yanchuaner`。两个客户端的 ID、Secret 和精确回调必须隔离，自主入口的 OIDC Secret 也不得复用 YanCore 主体交换 Secret。

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
  -> 15 分钟 / 有限预算 / 模型白名单的哈希应用 Key
  -> AES-256-GCM 加密 HttpOnly Cookie（grant + 明文应用 Key）
  -> AI Web /api/chat/completions（同源、大小和消息结构校验）
  -> 燕中 API /v1/chat/completions（TokenAuth + 模型权限 + 公益额度结算 + 用量日志）
  -> LiteLLM 与已获授权上游
```

浏览器只能读取脱敏会话摘要，不能读取主站访问令牌、YanCore grant、OIDC Client Secret 或交换客户端 Secret。

## 模块边界

| 模块 | 责任 |
| --- | --- |
| `src/lib/oidc.ts` | 发现文档校验、授权码 + PKCE、state/nonce 和 ID Token 校验 |
| `src/lib/yancore.ts` | 使用独立服务客户端凭据交换 YanCore grant 和一次性应用 Key |
| `src/lib/session.ts` | AES-256-GCM 密封、Cookie 参数、过期与结构校验 |
| `src/lib/chat.ts` | 有界消息协议、固定 `/v1/chat/completions` 目标和安全响应头透传 |
| `src/app/api/auth/**` | 登录、回调和退出命令 |
| `src/app/api/session` | 只返回脱敏主体和过期时间 |
| `src/app/api/chat/completions` | 同源认证、请求上限、模型白名单与 SSE BFF |
| `src/app/page.tsx` | 燕中自主最小对话工作台，不依赖 Open WebUI 页面 |

## 安全约束

- 生产公开 URL、Issuer 和外部 OIDC 端点必须使用 HTTPS；本地明文内部 HTTP 必须显式开启，且生产模式的公开 HTTP URL 只接受回环 hostname；
- 登录事务 5 分钟过期，YanCore grant 最长 15 分钟；
- 会话 Cookie 为 `HttpOnly + SameSite=Lax`，HTTPS 时强制 `Secure`；
- Cookie 密文使用随机 96 位 IV 和 AES-256-GCM 认证标签；篡改、过期或结构错误一律按未登录处理；
- 应用 Key 只在 API 交换响应和加密 Cookie 明文中出现，`/api/session` 与浏览器脚本不可读取；
- 对话 POST 必须精确匹配公开站点 Origin，请求体不超过 32 KiB，模型必须同时通过 BFF 与 API Token 白名单；
- 应用不保存聊天正文，不记录令牌和完整请求头；
- `openid-client` 负责协议和 ID Token 验证，自主代码只定义燕中业务会话与交换边界。

## 当前限制

- 交换只映射已在燕中 API 绑定 `yanchuaner` OAuth 的用户，不按邮箱自动合并或静默创建账户；
- BFF 当前只实现文本 `chat/completions`，尚未实现对话持久化、文件、搜索、知识库、助手和图片；
- Key 级 RPM/TPM/并发策略仍为 P1，当前依赖 API 全局/用户限流和有限会话预算；
- Open WebUI 仍保留为默认 PoC，`ai-web` 通过 Compose `yancore` profile 在 3002 独立验收；真实 OpenAI/DeepSeek、退款和审计查询通过前不切换 3001 流量。

## 验收与回滚

自动验收：TypeScript 类型检查、会话篡改/过期、消息边界、服务端密钥转发、SSE 保留、Next 生产构建、Compose 配置、桌面与移动端无溢出。

集成验收：使用测试成员和受限渠道分别调用 OpenAI/GPT 与 DeepSeek；核对调用前后公益流水、Token 额度、用量日志和 request ID；模拟上游失败确认退款；并发耗尽不得产生负余额。该组需要真实 Docker/渠道环境，代码合并不代替其通过。

回滚：停止 `ai-web` profile 并关闭 API 的 `YANCHUANER_SUBJECT_EXCHANGE_ENABLED`。Open WebUI、LiteLLM 和现有数据不迁移、不删除；已签发 grant 与应用 Key 最迟 15 分钟自然失效。

## 下一增量

先完成真实集成验收与灰度监控，再增加用户可见的本次会话用量/剩余额度和调用记录。随后实现自主对话存储边界与文件能力；Open WebUI 在同等能力覆盖前继续作为明确标识的第三方 PoC。
