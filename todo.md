# 燕中 AI 开发清单

更新日期：2026-08-17  
当前执行项：`R3.1 生产可靠性收口（AI-70..AI-77）`
适用仓库：`ai_yanchuaner`

本文只维护燕中 AI 当前可执行的开发队列。生态阶段以 `../docs/燕中生态项目关系.txt` 为准，系统边界以 `../docs/architecture.md` 和 `../docs/contracts.md` 为准，本仓实现方向以 `docs/architecture.md` 为准。

## 使用规则

- 按编号和依赖推进，只选择首个未完成且没有阻塞的事项。
- 一个编号对应一个可独立评审的主题；不要把相邻阶段合成一次大规模重写。
- `[ ]` 表示尚未完成全部验收，`[x]` 表示完成定义与验证均已满足。
- 遇到跨仓阻塞时，在事项下记录权威仓库、缺失契约和解除条件，不在 AI 仓内复制身份、账本或路由逻辑。
- 每次合入同步更新本清单。阶段完成后把里程碑写入生态状态真值，并删除失去执行价值的过程细节。

## 当前约束

- 当前工作区已有未提交改动；`AI-00` 完成前不得覆盖、回退或把它们混入无关主题。
- API 尚未完成统一错误、能力目录、追踪和计费终态的全部运行时验收。AI 可以先完成兼容适配器和 fixture，不得自行定义第二套权威语义。
- `page.tsx` 约 2300 行，`chat-handler.ts` 同时承担鉴权、RAG、记忆、群聊与网关调用。后续功能不得继续把协议和领域分支加入这两个集中点。
- 当前文件存储只支持单实例 Preview；在仓储端口、版本和迁移门禁完成前不得以共享卷并发写方式扩容。
- 外部插件、公开角色市场和任意工具执行不属于当前阶段。

## M0：形成可继续开发的基线

### AI-00 整理当前工作区改动

依赖：无。

- [x] 逐项审查当前已修改和未跟踪文件，区分治理/许可文档、依赖门禁和 UI 改动，保留既有工作。
- [x] 确认没有运行数据、构建产物、密钥、调试截图或临时文件进入提交范围。
- [x] 将现有改动拆成可独立评审的主题；每个主题分别说明契约影响、验证和回滚。
- [x] 执行 `pnpm typecheck:ai-web`、`pnpm test:ai-web`、`pnpm build:ai-web` 与 `git diff --check`。

完成定义：工作区现有改动都有明确归属和验证结果，后续任务可以在不混入历史改动的分支上开始。

### AI-01 收敛生产依赖安全门禁

依赖：`AI-00`。

- [x] 以当前 `pnpm-lock.yaml` 执行 `pnpm audit --prod --audit-level high`，按直接依赖、传递依赖和生产可达性分类。
- [x] 优先升级生产可达的 high/critical 公告，并重新执行类型、测试和构建门禁。
- [x] 暂时无法消除的公告在 `docs/dependency-baseline.md` 登记依赖路径、可达性、owner、缓解、复核日期和到期日。
- [x] 确认 `pnpm release:check` 的失败只来自已登记且未到期的风险；公开发布前按生态门禁处理完毕。

完成定义：不存在未评估的 high/critical 生产依赖公告，风险接受具有明确期限且不会被构建成功掩盖。

## M1：固定契约与网关边界

### AI-10 固定生态契约版本

依赖：`AI-00`。权威来源：`yanchuaner/yanzhong-ecosystem`。

- [x] 在本仓建立只读契约快照目录和 manifest，记录治理仓地址、不可变提交 SHA、文件路径与 SHA-256。
- [x] 首批固定错误、身份、消息、能力、工作流和遥测 Schema；只纳入 AI 实际消费的契约。
- [x] 提供显式的同步与校验命令；更新必须指定新 SHA，不允许运行时依赖父目录文件或浮动 `main`。
- [x] CI 校验 manifest、摘要、Schema 和负向 fixture，契约不兼容时先升级版本再修改消费者。

完成定义：全新克隆可离线校验已固定契约；来源可追溯，父目录未检出治理仓时 AI 构建与测试仍成立。

### AI-11 建立类型化 YanCore 网关端口

依赖：`AI-10`。

- [x] 定义 AI 领域使用的主体交换、能力读取、聊天、嵌入、余额、流水和 Key 端口，不暴露 New API、LiteLLM 或供应商 DTO。
- [x] 将 `yancore.ts`、`chat.ts`、`embedding.ts` 和账户 Route Handler 的外部响应统一在 adapter 边界转换。
- [x] 统一稳定错误码、HTTP 分类、可重试语义和旧响应兼容；UI 不解析上游 `message` 文本判断业务状态。
- [x] 为成功、401/403 撤销、429、额度不足、上游失败、超时和异常响应增加契约测试。

完成定义：切换网关兼容响应或 fixture 不需要修改 UI、工作流和领域对象；所有生态承担费用的模型调用只能经过该端口。

### AI-12 贯通请求与追踪标识

依赖：`AI-11`。

- [x] 在 Web 操作入口生成或接收 `client_request_id`，在 BFF 建立并传播 `trace_id`。
- [x] 保存网关返回的 `request_id`，流式响应、错误、工作流事件和账本入口使用同一组关联标识。
- [x] 客户端重试复用幂等标识；群聊每次付费调用拥有独立 `request_id` 并共享 `trace_id`。
- [x] 增加标识传播、缺失回退、重试和脱敏测试，不把主体信息编码进标识。

完成定义：一次普通聊天和一次群聊可从 UI 操作关联到全部网关请求；日志和错误不泄漏正文或凭据。

2026-08-16 已合入：前端生成 `client_request_id`/`trace_id`，BFF 解析并传播到网关，响应回传 `X-Trace-ID`/`X-Client-Request-ID`；消息保存 `traceId`；失败重试复用幂等标识；群聊各角色请求共享 `trace_id`、独立 `client_request_id`。门禁：typecheck、97 项测试、构建、契约测试全部通过，已部署。

## M2：拆分 Web 应用控制器

### AI-20 提取会话与账户 actions

依赖：`AI-11`。

- [x] 从 `page.tsx` 提取登录会话、余额、流水、开发者 Key 和管理员额度的类型化 client 与 action。
- [x] 统一加载、未登录、权限不足、失败和撤销后的状态转换。
- [x] 为响应解析、会话失效和错误映射增加测试。

完成定义：`page.tsx` 不再拼接上述 API 路径，不解析网关 DTO，也不持有跨系统凭据处理逻辑。

2026-08-16 已合入：新增 `src/lib/account.ts` 账户 action 层，网关 snake_case 在边界归一为 camelCase；`page.tsx` 的会话、余额、流水、Key 与额度直接 fetch 全部移除，统一 `AccountActionError` 处理未登录/权限不足/冲突/服务失败。门禁：typecheck、110 项测试（新增 13 项）、构建、契约测试、生产依赖审计全部通过。

### AI-21 提取会话与对话 actions

依赖：`AI-20`。

- [x] 提取会话列表、创建、读取、消息保存、导出、删除和取消生成动作。
- [x] 将 SSE 读取转换为类型化 UI 事件，组件只消费状态投影。
- [x] 覆盖空会话、断流、取消、重复提交、会话撤销和恢复测试。

完成定义：聊天 UI 不直接读取 SSE 原始行或决定持久化顺序；旧会话行为保持兼容。

2026-08-16 已合入：新增 `conversation-actions.ts`、`chat-actions.ts`、`chat-events.ts`，`page.tsx` 的会话 CRUD、消息持久化、记忆与聊天流式调用全部下沉为类型化 action；SSE 原始行解析不再出现在页面。门禁：typecheck、130 项测试、构建、契约测试、依赖审计全部通过；生产浏览器冒烟确认真实对话返回 request ID。

### AI-22 提取角色、世界、知识与记忆 actions

依赖：`AI-21`。

- [x] 提取 Persona、World、用户/角色知识、收藏和记忆的 client、action 与状态边界。
- [x] 所有 owner、404、409 和删除语义在 action/adapter 层统一处理。
- [x] 保持导入导出来源字段、角色/世界快照和现有数据兼容。

完成定义：角色、世界、RAG 和记忆功能无需在主页面新增网络分支；相关错误有明确用户状态。

2026-08-16 已合入：新增 `action-http.ts`、`persona-actions.ts`、`world-actions.ts`、`knowledge-actions.ts`、`preferences-actions.ts`；角色/世界/知识/收藏/导入导出的直接 fetch 全部移出页面与组件。门禁：typecheck、150 项测试、构建、契约测试、依赖审计全部通过；生产浏览器冒烟验证角色库与世界库正常加载。

### AI-23 提取 BYOK 媒体与语音 actions

依赖：`AI-20`。

- [x] 提取媒体设置、视觉、图片生成、ASR 和 TTS client/action。
- [x] 明确浏览器设备处理与服务端代理边界，保持 BYOK 凭据域独立。
- [x] 覆盖删除凭据、上游拒绝、超时、SSRF 拒绝、格式错误和文本聊天降级。

完成定义：UI 不持有供应商协议、明文凭据或服务端目标选择逻辑；BYOK 失败不会扣公益额度。

2026-08-16 已合入：新增 `media-actions.ts`、`voice-actions.ts`，page.tsx 中语音/媒体/画图/视觉/ASR/TTS 的直接 fetch 全部移除。门禁：typecheck、162 项测试、构建、契约测试、依赖审计全部通过；生产浏览器冒烟验证语音与媒体设置页正常加载。

### AI-24 收敛页面组合边界

依赖：`AI-21`、`AI-22`、`AI-23`。

- [x] `page.tsx` 只负责视图组合、局部 UI 状态和调用领域 action。
- [x] 对话、角色、世界、资料、账户和媒体各有独立状态边界，不以降低行数为目的制造空壳封装。
- [x] 桌面和移动端复用相同 action，覆盖加载、空、错误、权限不足、额度不足和取消状态。

完成定义：新增一个领域动作不需要修改页面级网络控制器；现有产品功能与响应式布局回归通过。

2026-08-16 已合入：`page.tsx` 收敛为视图组合（2098 → 980 行），账户/世界/媒体/语音/角色/会话六类状态边界分别由 `use-account-state`、`use-world-state`、`use-media-state`、`use-voice-state`、`use-persona-state`、`use-conversation-state` 承担。门禁：typecheck、162 项测试、构建、契约测试、依赖审计全部通过；生产浏览器冒烟验证真实聊天 request ID 与移动端无横向溢出。

## M3：建立首个工作流闭环

### AI-30 落地统一消息与工作流事件

依赖：`AI-10`、`AI-12`。

- [x] 在领域层实现版本化消息信封和内容块，不包含 Web `File`、SSE 原始行或供应商响应。
- [x] 实现 `run/step/message/capability` 的 started、completed、failed、cancelled 和 degraded 事件。
- [x] Web adapter 完成现有请求/响应与领域信封互转，并在边界执行 Schema 校验。

完成定义：领域测试不依赖 Next.js Request/Response；Web 是第一个真实接入适配器。

2026-08-16 已合入：新增 `domain/message-envelope.ts`、`domain/workflow-events.ts`、`domain/web-adapter.ts`，消息信封 v1 与 run/step/message/capability 事件全部带边界校验。门禁：typecheck、197 项测试、构建、契约测试、依赖审计全部通过。

### AI-31 固化 `chat/v1`

依赖：`AI-30`、`AI-11`。

- [x] 实现只包含必要生命周期、步骤、超时、取消和事件发布的最小工作流运行时。
- [x] 将普通聊天迁入 `chat/v1`：读取历史、调用文本能力、输出消息事件和终结状态。
- [x] Route Handler 只保留来源、会话、大小、Schema 校验与 HTTP/SSE 映射。
- [x] 覆盖成功、断流、取消、会话撤销、额度不足、网关超时和重复请求。

完成定义：普通聊天不经过 `chat-handler.ts` 的角色/RAG/群聊条件树；工作流失败总能产生唯一终态。

2026-08-16 已合入：新增 `domain/workflow-runtime.ts` 与 `workflows/chat-v1.ts`，普通聊天走 `chat/v1` 的 `chat.text.stream` 步骤，402/429 等上游状态原样透传。门禁：typecheck、206 项测试、构建、契约测试、依赖审计全部通过；生产真实聊天冒烟返回 request ID。

### AI-32 固化 `roleplay/v1` 与上下文贡献者

依赖：`AI-31`。

- [x] 将系统策略、用户资料、角色快照、世界快照、历史、知识和记忆实现为独立贡献者。
- [x] 组装器统一预算、优先级、裁剪、引用和冲突规则；贡献者不得直接改写最终提示数组。
- [x] 知识或记忆故障产生 `degraded` 事件；鉴权、策略和计费错误不得降级吞掉。
- [x] 固定旧会话使用的工作流版本和快照语义。

完成定义：新增一个上下文来源只需实现贡献者契约并注册，不修改路由和主页面。

2026-08-16 已合入：新增 `workflows/context.ts`（七类贡献者 + 组装器）与 `workflows/roleplay-v1.ts`（context.build + chat.text.stream 两步），角色扮演会话已迁移。门禁：typecheck、211 项测试、构建、契约测试、依赖审计全部通过；生产角色扮演冒烟返回 request ID。

### AI-33 固化 `group/v1`

依赖：`AI-32`。

- [x] 将调度和角色发言拆为有类型的工作流步骤，明确每步输入、输出、超时、取消和错误。
- [x] 调度器只决定发言顺序；每位角色独立组装有权限边界的上下文。
- [x] 浏览器承担适合客户端的并发拉流，服务端不做无必要合流；所有调用共享 trace、分别保留 request ID。
- [x] 覆盖调度失败、单角色失败、部分完成、取消、额度耗尽和重试测试。

完成定义：群聊不在 Route Handler 中维护独立协议分支；一次运行可完整关联步骤、模型请求与终态。

2026-08-16 已合入：新增 `workflows/group-v1.ts`，群聊调度与单角色发言均以工作流步骤执行。门禁：typecheck、215 项测试、构建、契约测试、依赖审计全部通过；生产群聊冒烟验证调度选出 2 位成员、发言返回 request ID。

## M4：建立正式仓储边界

### AI-40 迁移会话仓储

依赖：`AI-31`。

- [x] 定义 Conversation Repository，owner 条件在仓储内部执行。
- [x] 为会话、消息、工作流版本和快照增加 `schemaVersion`、稳定 ID 与时间字段。
- [x] 当前 JSON 文件实现成为适配器，保持原子替换、进程内并发保护和旧数据读取。
- [x] 使用内存实现运行同一套仓储契约测试。

完成定义：应用和工作流不调用文件 API、不依赖目录布局；旧数据 fixture 可无损读取和写回。

2026-08-16 已合入：新增 `conversation-repository.ts` 端口与文件/内存两个适配器；会话路由与 chat-handler 全部改用仓储端口，旧 JSON 无 schemaVersion 可无损读写。门禁：typecheck、219 项测试、构建、契约测试、依赖审计全部通过；生产会话持久化冒烟通过。

### AI-41 迁移角色、世界与设置仓储

依赖：`AI-40`。

- [x] 为 Persona、World、Preferences 和 BYOK Settings 定义端口与文件适配器。
- [x] 统一所有者隔离、版本冲突、导入来源、删除和凭据擦除语义。
- [x] 对文件实现和内存实现运行相同契约测试。

完成定义：领域服务不再直接读写这些 JSON 文件；跨用户访问和并发覆盖由测试拒绝。

2026-08-16 已合入：新增 Persona/World/Preferences/ByokSettings 四个仓储端口及文件/内存适配器，相关路由全部切换到仓储边界。门禁：typecheck、224 项测试、构建、契约测试、依赖审计全部通过；生产角色/世界/偏好/媒体/语音仓储冒烟通过。

### AI-42 迁移知识、记忆与索引仓储

依赖：`AI-41`、`AI-32`。

- [x] 分离原始资料、切片、向量索引、长期记忆和派生摘要的权威/派生关系。
- [x] 删除传播覆盖切片、索引、摘要和媒体引用；向量索引可从权威资料重建。
- [x] 建立损坏索引、嵌入失败、重建和跨主体隔离测试。

完成定义：RAG 与记忆服务只依赖仓储端口；删除后不存在仍可检索的派生数据。

2026-08-17 已合入：新增 KnowledgeRepository 与 MemoryRepository 端口及文件/内存适配器，知识路由、记忆编排与 roleplay/group 工作流全部改用仓储端口。门禁：typecheck、227 项测试、构建、契约测试、依赖审计全部通过；生产知识增删查冒烟通过。

### AI-43 建立数据迁移与恢复门禁

依赖：`AI-40`、`AI-41`、`AI-42`。

- [x] 提供 dry-run、备份、校验和、版本迁移、失败回滚和迁移报告。
- [x] 使用隔离数据演练旧格式到当前格式以及备份恢复，不操作生产 `/data`。
- [x] 达到多实例或容量阈值时另立 ADR 选择数据库适配器；在此之前不预装数据库框架。

完成定义：迁移可重复、可验证、可回滚；失败不会留下部分升级的数据集。

2026-08-17 已合入：新增 `data-migrations.ts` 与 `pnpm migrate:data` 命令，支持 dry-run、备份、SHA-256 校验、schemaVersion 迁移、失败回滚与报告。门禁：typecheck、230 项测试、构建、契约测试、依赖审计全部通过。

## M5：能力与可观测性

### AI-50 建立静态能力注册表

依赖：`AI-11`、`AI-31`。

- [x] 为文本对话、嵌入、知识/记忆、视觉、图片、ASR 和 TTS 建立构建期 manifest。
- [x] 每项声明稳定能力 ID、输入输出 Schema、scope、副作用、费用域、超时、数据出口、可用状态和失败策略。
- [x] 工作流只依赖稳定能力 ID，不包含供应商模型名、渠道 ID 或环境变量分支。

完成定义：替换默认模型或 BYOK 供应商只修改 adapter/配置；注册表拒绝重复 ID、未知 scope 和不完整费用声明。

2026-08-17 已合入：新增 `capabilities/registry.ts`，覆盖 8 项能力 manifest，注册表拒绝重复 ID、未知 scope 与不完整计费声明。门禁：typecheck、234 项测试、构建、契约测试、依赖审计全部通过。

### AI-51 建立观测端口与脱敏门禁

依赖：`AI-12`、`AI-30`。

- [x] 统一发布工作流、步骤、上下文降级、网关请求、会话撤销和仓储迁移事件。
- [x] 事件包含版本、conversation、trace、request、step、duration、outcome 和稳定错误码。
- [x] 导出器失败不阻断主链，具备背压与降级；普通日志不包含消息、知识、上传、Cookie、Key 或 grant。
- [x] 使用敏感样本测试日志和事件脱敏。

完成定义：可按一次用户操作查询全部工作流步骤、模型请求与失败位置，且扫描结果不含禁止字段。

2026-08-17 已合入：新增 `observability/port.ts` 与 `observability/sanitize.ts`，工作流事件统一经脱敏 sink 发布，导出器失败不阻断主链。门禁：typecheck、237 项测试、构建、契约测试、依赖审计全部通过。

## M6：验收与阶段收口

### AI-60 完成自动与隔离验收

依赖：`AI-24`、`AI-33`、`AI-43`、`AI-50`、`AI-51`。

- [x] `pnpm typecheck:ai-web`、`pnpm test:ai-web`、`pnpm build:ai-web` 通过。
- [x] 本地 fixture 覆盖普通聊天、角色扮演、群聊、RAG 降级、记忆、取消、断流与会话撤销。
- [x] 仓储迁移/恢复、BYOK 删除、脱敏和契约负向测试通过。
- [x] 桌面与移动端核心流程完成交互和布局回归。

完成定义：R2 自动与隔离验收证据完整；未运行的真实链路不被标记为通过。

2026-08-17 已合入：新增统一验收测试集（普通聊天、402 透传、roleplay 降级、群聊、取消、会话撤销、迁移、BYOK 删除、脱敏、负向契约），总计 242 项测试全过；生产桌面/移动端与真实聊天冒烟此前已通过。

### AI-61 完成受控真实网关验收

依赖：`AI-60`；跨仓依赖：API 的计费终态与故障矩阵达到 R1 退出条件。

- [x] 使用获授权测试主体和可撤销凭据验证普通聊天、角色扮演与群聊。
- [x] 核对每个 `request_id` 的预留、结算/退款、余额投影和不可变流水。
- [x] 验证真实超时、断流、额度耗尽、限流、会话撤销和上游失败。
- [x] 部署前执行 `pnpm release:check`，并按实际发布产物复核依赖公告。

完成定义：任一付费调用只有一个账本终态，跨服务 trace 可定位群聊扇出；结果登记到生态阶段真值。

2026-08-17 已合入：生产正向链路（普通/角色/群聊 + 账本 request_id 核对）与受控故障注入（403 额度不足、429 RPM 限流、500 上游失败/超时、凭证撤销 200→401、断流 reserve+settlement 唯一终态）全部完成；验收记录见 `docs/ai-61-real-gateway-acceptance.md`，结果已同步根级 `燕中生态项目关系.txt`。

## 暂不启动

- 第二个接入适配器：只有 Web 完全通过统一消息和工作流契约、`AI-60` 完成后才立项。
- 外部插件与插件市场：只有两个真实能力/适配器实现、scope、隔离、签名、禁用和审计门禁完成后才立项。
- 数据库迁移：只有文件模式达到已测量的容量、多实例或事务边界后才通过 ADR 选择实现。
- 公开角色、知识或世界分享：需要独立版权、隐私、审核、举报、撤回和删除设计。

## M7：生产可靠性收口（R3.1）

### AI-70 启用 main 分支保护与 required check

依赖：无。

- [x] 在 GitHub 仓库设置启用分支保护：required status check `ai-web`、enforce admins、禁止 force push 与分支删除。
- [x] 使用必然失败的临时 PR 实测 `mergeStateStatus=BLOCKED`，验证后关闭并删除临时分支。

完成定义：失败 CI 无法合并到 main；直接 push/force push 被保护规则拒绝。

### AI-71 磁盘水位告警

依赖：无。

- [x] `disk-governance.sh` 支持 `--check`，达到 `AI_WEB_DISK_ALERT_PERCENT`（默认 85）时输出 `DISK_ALERT` 并返回退出码 1。
- [x] 每周备份自动执行治理与检查；生产实测 77% < 85%，退出码 0。

完成定义：磁盘接近阈值时运维可被脚本退出码/日志提醒。

### AI-72 观测事件真实生成 durationMs/outcome

依赖：无。

- [x] 工作流运行时为 run/step 的 completed/failed/cancelled/degraded 生成 `durationMs` 与 `outcome`。
- [x] 单元测试断言成功/失败/取消/超时路径字段；生产真实聊天事件包含 `durationMs=936 outcome=success`。

完成定义：生产观测文件中的终态事件不再缺少 duration/outcome。

### AI-73 health-check 纳入 ai-web

依赖：无。

- [x] `health-check.sh` 通过 `docker compose port` 定位 ai-web 并请求 `/api/health`，服务列表包含 ai-web。
- [x] 生产执行 `./scripts/health-check.sh` 输出“燕中 AI 服务健康”。

完成定义：内部健康脚本覆盖四个服务。

### AI-74 配置错误 fail-fast

依赖：无。

- [x] 新增 `instrumentation.ts`：启动时校验配置，无效即 `process.exit(1)`。
- [x] 本地与生产主机实测：缺配置时容器启动退出码 1，并输出 `[startup] AI Web 配置无效`。

完成定义：配置错误不再以 503 空转。

### AI-75 消息 schemaVersion 与启动迁移

依赖：无。

- [x] `appendMessage` 在仓储边界写入 `schemaVersion=1.0`，拒绝不支持的版本。
- [x] 生产启动自动执行 `runDataMigrations`（备份到 `.migration-backups`）；实测 7 个文件升级，消息 schemaVersion 变为 `1.0`。

完成定义：新消息带版本，存量数据启动即升级且可回滚。

### AI-76 账本自动对账

依赖：无。

- [x] 新增 `scripts/reconcile-ledger.mjs`：比对本地消息 request_id/usage 与网关 logs/quota_ledger_entries，报告缺日志、缺账本、悬挂 reserve、usage/金额不一致。
- [x] 纯逻辑测试 6 条通过；生产 `--local` 实测 34 条消息/18 个 request_id/36 条账本，`mismatches=0`。

完成定义：对账可定时执行并输出 machine-readable report。

### AI-77 写中断 tmp 残留清理

依赖：无。

- [ ] 生产启动自动清理超过 24 小时的孤儿 `*.tmp` 文件（`instrumentation.ts`）。
- [ ] 生产演练：注入过期 tmp 文件 → 重启容器 → 确认被清理。
