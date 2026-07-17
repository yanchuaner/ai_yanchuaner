# 燕中 AI（ai_yanchuaner）

燕中 AI 是面向深圳市燕川中学校友、在校师生与校友会共建者的统一 AI 服务项目。项目将为燕中生态中的网站、智能助手、内容工具和开发者能力提供一致、可控的模型访问入口。

当前阶段以“2026 燕中生态暑期预览”为目标，不建设公开售卖型 API 中转站。正式版计划在大二上学期持续一个学期，根据真实使用、成本、隐私与运维数据继续打磨。

## 当前状态

截至 2026 年 7 月 17 日，主站、燕中 API、LiteLLM 与 Open WebUI 已打通：认证成员通过主站 OIDC 登录 Open WebUI，Open WebUI 使用燕中 API 的受限服务 Key，再由燕中 API 经 LiteLLM 调用获授权模型。开放注册与本地密码体系保持关闭，模型请求不再绕过统一额度与审计控制面。

普通请求、SSE 流式输出、虚拟 Key 鉴权、模型权限、预算、RPM 限流、图片生成、备份恢复、HTTPS 和重启恢复已经验证。文本和图片能力目前仍需补充同能力第二渠道、跨供应商故障切换、预算耗尽与 TPM 超限演练。详细记录见 [LiteLLM 与 Open WebUI PoC 验收记录](docs/litellm-openwebui-poc.md)。

## 暑期预览目标

- 认证在校生、校友与教师使用主站账号进入独立工作台，不维护共享管理员账号。
- 网页工作台只通过燕中 API 的受限服务 Key 调用模型；LiteLLM 负责上游路由，不作为用户余额真值。
- 用户侧清晰展示可用模型、隐私边界与用量；公益额度、API Key 和逐请求账单由 `api_yanchuaner` 统一管理。
- 完成文本与图片核心场景、移动端体验、失败提示、预算耗尽与恢复演练。
- LiteLLM 管理界面不开放公网，只允许管理员通过本地隧道访问。

暑期预览不等于正式开放。首批范围仍是少量认证成员；BYOK、支付、公开注册、长期记录策略和多渠道自动切换必须经过专项验收后再启用。

## 项目目标

- 让非技术用户通过清晰的工作台使用写作、总结、演示文稿、活动策划等 AI 工具。
- 让开发者通过统一接口调用不同模型，减少重复适配。
- 通过燕中 API 逐步支持合规 BYOK，并提供有限的燕中公益额度。
- 将用户、权限、预算、模型和审计纳入统一管理。
- 为燕中网站、小程序、未来 App 和 Agent 产品提供长期稳定的 AI 底座。

## 用户与角色

| 角色 | 主要能力 |
| --- | --- |
| 校友与师生 | 使用获准开放的 AI 工具，管理个人偏好；额度与密钥前往燕中 API 查看 |
| 共建开发者 | 使用受限虚拟 API Key，参与 Agent 和应用开发 |
| 校友会运营者 | 管理用户额度、开放范围和内容工具 |
| 系统管理员 | 管理模型渠道、安全策略、运行状态和审计记录 |

## 暑期预览 MVP

首版只验证一条完整、可管理的内部使用链路：

1. 管理员接入多个合规模型渠道。
2. 已审核用户从燕中网站进入 AI 工作台。
3. 用户可进行多模型对话，并使用少量预设工具。
4. 燕中 API 按用户记录用量，执行预算、模型权限和频率限制。
5. 用户先使用有限公益额度；BYOK 在凭据保险库和专项审计完成后再开放。
6. 管理员可以查看运行状态、成本概况和异常调用。

首批工具建议：

- 通用对话与资料总结
- 写作润色与结构优化
- PPT 大纲与演讲内容整理
- 校友会新闻、通知和活动策划辅助
- 面向共建者的统一模型 API

## 暂不包含

- 公开注册和匿名调用
- 充值、支付、返佣、兑换码和公开售卖 API Key
- 消费级订阅账号共享、号池或订阅额度转 API
- 不受限制的任意 Base URL 代理
- 自动代写并直接提交学术作业
- 大规模开放运营

## 总体边界

```text
燕中网站账号与审核
        ↓
AI 工作台
        ↓
燕中 API：用户权限 / 公益额度 / API Key / 审计
        ↓
LiteLLM：上游路由 / 重试 / 成本核对
        ↓
官方 API / 合规第三方接口 / 国内模型 / 本地模型
```

项目与燕中网站、燕中 API 保持独立仓库。主站负责身份与入口，燕中 API 负责用户额度与消费账本，本项目负责 AI 网页产品和 LiteLLM 数据面；三者通过受控接口集成。

## 技术方向

当前采用 LiteLLM 作为模型网关，本地验证版本为 `1.92.0`。Docker Compose 使用镜像摘要固定已验证构建，避免 `latest` 标签变化造成环境漂移。上层产品不依赖单一模型供应商。

建议的应用组成：

- Web：AI 工作台与管理界面
- API：身份映射、凭据管理、额度和业务接口
- Gateway：LiteLLM
- Database：用户映射、配置、额度和审计数据
- Observability：运行日志、成本、告警和健康检查

最终框架、数据库和部署编排以技术验证结果为准，不在尚未验证前锁定。

## 本地开发环境

当前最小环境由三个 Docker 容器组成：

- `litellm`：接收统一格式的模型请求，执行鉴权、路由、预算和统计。
- `db`：PostgreSQL 数据库，保存 LiteLLM 的配置、虚拟 Key 和用量数据。
- `open-webui`：提供内部测试使用的聊天、会话和流式交互界面。

关键配置文件：

- `docker-compose.yml`：描述容器、网络、数据卷、启动顺序和健康检查。
- `gateway/config.yaml`：描述 LiteLLM 的模型、主密钥和数据库连接。
- `.env.example`：可提交的变量说明，不包含真实凭据。
- `.env`：本机真实开发配置，已被 Git 忽略。

启动环境：

```powershell
cd C:\Dev\yanchuaner\ai_yanchuaner
docker compose pull
docker compose up -d
docker compose ps
```

一键检查 Compose、容器和网关健康状态：

```powershell
.\scripts\check-environment.ps1
```

完成模型和测试虚拟 Key 配置后，运行冒烟测试验证完整调用链路：

```powershell
.\scripts\smoke-test.ps1
```

冒烟测试会读取本地 `.env` 中的 `LITELLM_TEST_KEY` 和 `LITELLM_TEST_MODEL`，依次验证网关健康、虚拟 Key 鉴权和模型文本回复。脚本不会输出虚拟 Key。

验证模型是否支持 SSE 流式输出：

```powershell
.\scripts\stream-test.ps1
```

接入 `gpt-image-2` 时，使用安全提示输入官方或 OpenAI 兼容上游的 API Key。脚本会先验证上游鉴权，再把上游地址和凭据加密保存到 LiteLLM，并生成只允许图片模型、带预算和 RPM 限制的 Open WebUI 专用虚拟 Key。官方 OpenAI 可直接运行脚本；兼容中转站需要显式指定其 `/v1` 地址：

```powershell
.\scripts\configure-gpt-image.ps1
# 或使用兼容上游：
.\scripts\configure-gpt-image.ps1 -ApiBaseUrl "https://api.example.com/v1"
docker compose up -d --force-recreate open-webui
.\scripts\sync-openwebui-image-config.ps1
.\scripts\image-smoke-test.ps1
```

真实上游 API Key 不写入 `.env`，也不会输出到终端；本地 `.env` 只保存可随时撤销的 LiteLLM 图片虚拟 Key。同步脚本用于覆盖 Open WebUI 数据库中的旧图片设置，并关闭不必要的提示词自动改写。图片冒烟测试的结果写入系统临时目录，不进入仓库。

流式测试会在终端实时追加模型文本，并报告文本片段数、首段延迟和总耗时。响应类型必须为 `text/event-stream`，且正常收到结束标记 `[DONE]` 才会通过。

查看网关日志：

```powershell
docker compose logs -f litellm
```

服务入口：

- 管理界面：`http://localhost:4000/ui`
- 燕中 AI 测试界面：`http://localhost:3001`
- 存活检查：`http://localhost:4000/health/liveliness`
- OpenAI 兼容 API：`http://localhost:4000/v1`

Open WebUI 当前只监听本机地址，并通过 `OPENWEBUI_LITELLM_KEY` 使用独立的受限虚拟 Key 连接 LiteLLM。`LITELLM_TEST_KEY` 只供 PowerShell 测试脚本使用，当前实例已关闭开放注册。

全新实例默认禁止注册。首次初始化时，在本地 `.env` 中临时设置 `OPENWEBUI_ENABLE_SIGNUP=True` 并启动服务，创建首个管理员后，立即在 `管理员面板 → 设置 → 身份验证` 中关闭新用户注册，再将该变量改回 `False`。

重置唯一 Open WebUI 管理员时，运行以下脚本并按提示隐藏输入两次新密码。脚本会保留原账号数据，将登录邮箱统一为 `yanchuaner@yanchuaner.cn`：

```powershell
.\scripts\reset-openwebui-admin.ps1
```

LiteLLM 管理界面使用独立账号，重置时运行以下脚本。脚本将用户名设为 `yanchuaner`，密码隐藏写入本地 `.env`，不会修改 LiteLLM 主密钥：

```powershell
.\scripts\reset-litellm-admin.ps1
```

Open WebUI 会将外部连接配置保存到自己的数据库，保存后的后台配置优先于环境变量。轮换 `OPENWEBUI_LITELLM_KEY` 后，还需要在 `管理员面板 → 设置 → 外部连接` 中同步更新 API Key。

当前原型将知识库嵌入切换为远程 OpenAI 兼容模式，以避免首次启动下载体积较大的本地嵌入模型。聊天功能不受影响；文件检索和知识库功能需要在 LiteLLM 接入嵌入模型后再启用。

停止环境不会删除数据库：

```powershell
docker compose down
```

仅在确认不再需要全部本地数据时，才可执行 `docker compose down -v` 删除数据库卷。

首次使用时，从 `.env.example` 复制一份不提交到 Git 的 `.env`，并填写独立的开发密钥。项目现有 `.env` 只用于本机验证，上线前必须重新生成生产密钥。

## 安全红线

- 上游 API Key 和用户 BYOK 凭据不得明文落库、写入日志或返回前端。
- 自定义接口必须经过供应商或域名白名单校验，并阻断内网地址、回环地址、云元数据地址和 DNS 重绑定风险。
- 每个用户、团队和虚拟 Key 必须具备独立权限、预算和撤销能力。
- 默认不保存完整对话正文；确需保存时必须由用户主动选择并明确保存范围。
- 日志默认脱敏，不记录口令、令牌、Cookie 和完整请求头。
- 管理操作必须可追溯，高风险操作需要再次确认。
- 生产与开发环境完全隔离，生产密钥只通过密钥管理或环境注入提供。
- 仅使用来源明确、条款允许的模型服务，不建设账号池和规避上游限制的能力。

## 推进阶段

### 阶段 0：项目基线

- 确定首版用户流程和接口边界
- 建立开发、测试和生产环境约定
- 建立基础代码、配置模板和自动检查

### 阶段 1：网关验证

- 部署 LiteLLM
- 接入至少两个不同模型渠道
- 验证流式输出、统一接口、虚拟 Key、预算、限流和故障切换
- 记录资源占用、稳定性和实际成本

### 阶段 2：内部 MVP

- 接入燕中网站身份
- 完成 AI 工作台和管理员入口
- 实现个人额度、模型权限、调用统计和基础 Agent
- 邀请 20 至 50 名内部成员测试

### 阶段 3：BYOK

- 添加、测试、停用和删除个人凭据
- 完成凭据隔离、加密、白名单和异常保护
- 支持个人凭据与公益额度之间的明确选择

### 阶段 4：产品扩展

- 按真实需求增加写作、PPT、活动运营、校友服务和开发工具
- 根据使用数据评估模型组合、公益额度和长期运营方式

## 首版完成标准

- 已审核用户可以从登录到完成一次 AI 任务，全流程无人工介入。
- 至少两个模型渠道可调用，其中一个故障时有明确降级结果。
- 预算、限流和模型权限能够真实阻断越权请求。
- 用户之间的凭据、记录和额度相互隔离。
- 管理员能够撤销用户或虚拟 Key 的访问权限。
- 日志中不存在明文密钥和敏感认证信息。
- 核心接口具备自动化测试，部署和回滚步骤可重复执行。
- 桌面端和移动端核心流程均可正常使用。

## 项目结构（规划）

```text
ai_yanchuaner/
├─ apps/                 # 用户工作台与服务端应用
├─ packages/             # 共享类型、客户端和业务组件
├─ gateway/              # LiteLLM 配置与扩展（已建立）
├─ deploy/               # 部署编排和运维配置
├─ docs/                 # 产品、架构、决策与生态文档
├─ scripts/              # 开发、检查、备份与发布脚本
├─ docker-compose.yml    # 本地 LiteLLM 与 PostgreSQL 编排
├─ .env.example          # 无敏感值的环境变量模板
└─ README.md
```

代码初始化后，以实际结构替换本节，不同时保留两套目录说明。

## 协作约定

- 功能开发以真实用户流程为单位，避免先堆积孤立页面。
- 每项改动说明目标、范围、风险和验证结果。
- 优先复用现有燕中品牌、账号和权限规则，不重复建设身份系统。
- 新增依赖前说明必要性，并固定可复现版本。
- 不提交 `.env`、数据库、备份、日志或任何真实密钥。
- 重要产品和架构决定记录到 `docs/`，避免只留在聊天记录中。

## 相关项目

- 燕中网站：`C:\Dev\yanchuaner\web_yanchuaner`
- 微信小程序：`C:\Dev\yanchuaner\mp_yanchuaner`
- 燕中生态愿景：[docs/yanzhong-ecosystem-vision.md](docs/yanzhong-ecosystem-vision.md)
- 网关 PoC 验收：[docs/litellm-openwebui-poc.md](docs/litellm-openwebui-poc.md)
- 生产部署与低维护运行：[docs/deployment.md](docs/deployment.md)
