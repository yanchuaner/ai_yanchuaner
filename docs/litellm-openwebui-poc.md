# LiteLLM 与 Open WebUI PoC 验收记录

> 本文记录控制面接入前的历史直连 PoC，不是当前生产部署说明。现行链路与密钥边界以 `docs/api-platform-integration.md` 和 `docs/deployment.md` 为准；不得按本文把 Open WebUI 重新直连 LiteLLM。

## 文档信息

- 验收日期：2026 年 7 月 14 日
- 验收范围：本地单渠道模型网关与内部聊天工作台
- 当前结论：单渠道 PoC 通过，阶段 1 尚未全部完成

本文只记录验证结论、运行约定和已知边界，不包含真实 API Key、账号、邮箱、密码或完整请求内容。

## 验证目标

本轮 PoC 用于回答以下问题：

1. LiteLLM 能否统一代理现有 OpenAI 兼容模型渠道。
2. 虚拟 Key 能否隔离管理员密钥，并限制模型和请求频率。
3. 普通请求与 SSE 流式请求能否稳定工作。
4. Open WebUI 能否作为内部测试工作台接入 LiteLLM。
5. 模型、账号、聊天和用量数据能否在容器重建后保留。

## 当前结构

```text
浏览器
  ↓
Open WebUI
  ↓ 使用 OPENWEBUI_LITELLM_KEY
LiteLLM
  ↓ 使用加密保存的上游凭据
OpenAI 兼容模型渠道

PowerShell 测试脚本
  ↓ 使用 LITELLM_TEST_KEY
LiteLLM

LiteLLM
  ↓
PostgreSQL
```

Open WebUI 与 PowerShell 测试脚本使用不同虚拟 Key，避免共享 RPM、预算和用量记录。Open WebUI 不持有 LiteLLM 管理员主密钥，LiteLLM 容器也不接收 Open WebUI 专用虚拟 Key。

## 已验证版本

| 组件 | 版本或镜像 |
| --- | --- |
| Docker | 29.6.1 |
| Docker Compose | 5.2.0 |
| PostgreSQL | 16 Alpine |
| LiteLLM | 1.92.0，镜像摘要已固定 |
| Open WebUI | 0.10.2，镜像摘要已固定 |

## 已验证能力

### 基础运行

- Docker Compose 配置解析通过。
- PostgreSQL、LiteLLM、Open WebUI 均具备健康检查。
- PostgreSQL 已完成 LiteLLM 数据表初始化。
- LiteLLM 和 Open WebUI 仅监听本机地址，当前不会直接暴露到局域网或公网。
- 容器重建后，LiteLLM 配置、虚拟 Key、Open WebUI 账号和聊天记录仍由独立数据卷保存。

### 模型与接口

- 已接入并验证 `deepseek/deepseek-v4-flash`。
- 已在模型列表中识别 `deepseek/deepseek-v4-pro`。
- Open WebUI 能通过专用虚拟 Key 读取获准模型列表。
- LiteLLM 对外提供 OpenAI 兼容接口：`http://localhost:4000/v1`。

### 普通请求

- `scripts/smoke-test.ps1` 可以完成健康检查、虚拟 Key 鉴权、模型调用和非空回复校验。
- 普通测试请求已成功返回，并产生可追踪的请求编号。
- 脚本不会打印或写出虚拟 Key。

### 流式请求

- `scripts/stream-test.ps1` 已验证响应类型为 `text/event-stream`。
- 已正常接收多个 SSE 文本片段和 `[DONE]` 结束标记。
- 一次代表性测试收到 158 个文本片段，首段延迟约 1.5 秒，总耗时约 4 秒。
- 测试数据只代表当次本地网络与模型状态，不作为服务等级承诺。

### 权限与限流

- 未获模型权限的虚拟 Key 请求被拒绝并返回 `403`。
- 模型名称必须与虚拟 Key 的允许模型完全一致。
- RPM 限制已实际触发并返回 `429`。
- 无效或已撤销 Key 会被 LiteLLM 拒绝并返回 `401`。
- 管理员主密钥、脚本测试 Key 和 Open WebUI 专用 Key 已分离。

### Open WebUI

- Open WebUI 能完成本地管理员注册、登录、模型选择和连续对话。
- 聊天回复支持流式显示。
- 桌面端和 `390×844` 手机视口均无横向溢出，手机注册表单可在一屏内显示。
- 当前实例已在管理员面板关闭新用户注册。
- Open WebUI 使用独立持久化数据卷保存账号、设置和聊天记录。
- 已通过图片专用虚拟 Key 调用 `gpt-image-2`，LiteLLM 图片接口和 Open WebUI 网页生成均返回有效图片。
- 图片专用 Key 只允许 `gpt-image-2`，并设置独立预算、RPM、并发数和有效期。
- Open WebUI 默认直接使用用户图片提示词，关闭文本模型二次改写，减少延迟、费用和额外故障点。

## 重要运行约定

### 密钥职责

| 环境变量 | 用途 | 是否允许发送到浏览器 |
| --- | --- | --- |
| `LITELLM_MASTER_KEY` | LiteLLM 管理权限 | 否 |
| `LITELLM_SALT_KEY` | 加密 LiteLLM 模型凭据 | 否 |
| `LITELLM_TEST_KEY` | PowerShell 测试脚本 | 否 |
| `OPENWEBUI_LITELLM_KEY` | Open WebUI 调用 LiteLLM | 否 |
| `OPENWEBUI_SECRET_KEY` | Open WebUI 登录签名与数据加密 | 否 |

真实值只保存在被 Git 忽略的本地 `.env` 中。任何 Key 一旦出现在聊天、日志、截图、提交记录或其他非预期位置，都应立即撤销并重新生成。

### Open WebUI 持久化配置

Open WebUI 会把外部连接写入自己的数据库。后台已经保存连接后，数据库值可能覆盖 Compose 环境变量。

轮换 `OPENWEBUI_LITELLM_KEY` 时需要同时完成：

1. 更新本地 `.env`。
2. 重新创建 Open WebUI 容器。
3. 在 `管理员面板 → 设置 → 外部连接` 中更新该连接的 API Key。
4. 刷新页面并确认模型列表可见。

只修改 `.env` 而不更新持久化连接，会导致 Open WebUI 继续使用旧 Key，并出现 `401`、连接错误或空模型错误。

### 注册控制

仓库默认设置 `OPENWEBUI_ENABLE_SIGNUP=False`。全新实例创建首个管理员时可以临时设置为 `True`，但完成后必须同时：

1. 在 Open WebUI 管理员面板关闭新用户注册。
2. 将本地变量恢复为 `False`。

当前 Open WebUI 只用于内部原型，不开放匿名访问或公开注册。

## 日常命令

启动：

```powershell
docker compose up -d
```

检查环境：

```powershell
.\scripts\check-environment.ps1
```

普通请求测试：

```powershell
.\scripts\smoke-test.ps1
```

流式请求测试：

```powershell
.\scripts\stream-test.ps1
```

查看日志：

```powershell
docker compose logs --tail=200 open-webui
docker compose logs --tail=200 litellm
```

停止但保留数据：

```powershell
docker compose down
```

不要在仍需保留数据时执行 `docker compose down -v`。

## 尚未验证

- 同一模型能力的第二个独立供应商。
- 跨供应商负载均衡与故障切换。
- TPM 超限的实际阻断行为。
- 最大预算耗尽后的实际阻断行为。
- 虚拟 Key 自动轮换。
- 生产环境 HTTPS、域名、备份、监控与告警。
- 与燕中网站账号审核系统的统一登录。
- 校友 BYOK 的凭据加密、域名白名单和 SSRF 防护。
- 面向多用户的隐私、内容安全和数据保留策略。

## 当前限制

- 文本和图片能力目前各自只有单一上游，不具备同能力的供应商级容灾。
- `gpt-image-2` 当前来自 OpenAI 兼容中转站，其稳定性、合规性和长期可用性仍需单独评估。
- Open WebUI 是内部验证界面，不是最终燕中品牌产品。
- 知识库暂时使用远程嵌入配置，但 LiteLLM 尚未接入可用嵌入模型，因此文件检索功能暂不可用。
- 当前服务只绑定本机地址，不可直接用于服务器公开部署。
- 当前密钥、预算和有效期均为开发环境配置，上线前必须重新生成并重新评估。

## 下一阶段

1. 接入第二个独立供应商，验证模型切换和故障降级。
2. 为 Open WebUI 建立更长期但仍受限的内部测试团队与虚拟 Key。
3. 验证 TPM、预算、禁用和轮换策略。
4. 设计燕中专属工作台，明确 Open WebUI 与最终产品的边界。
5. 设计燕中网站身份映射与内部 API 契约。
6. 制定生产环境部署、备份、日志脱敏和密钥轮换方案。
