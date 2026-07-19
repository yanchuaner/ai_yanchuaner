# 版权与来源矩阵

本矩阵审计当前全部受 Git 跟踪内容。分类描述来源和替换路线，不代表燕中生态取得第三方版权。

## 保留为依赖

| 目录/组件 | 来源与固定版本 | 处理 |
| --- | --- | --- |
| `open-webui` 容器 | Open WebUI `0.10.2`，revision `ecd48e2f718220a6400ecf49eafd4867a38feb10` | 作为外部客户端依赖；遵守品牌条件和完整许可 |
| `litellm` 容器 | BerriAI/LiteLLM revision `b3086ccd74553565c9a39716e72303ae985555f9` | 作为外部路由依赖；升级时复核企业目录边界 |
| `db` 容器 | PostgreSQL `16.14-alpine` | 作为外部数据库依赖 |
| `apps/ai-web` npm 依赖 | Next.js `15.5.19`、React `18.3.1`、openid-client `6.8.4`、Lucide React `0.542.0` | 作为框架、OIDC 协议客户端和图标依赖；版本由 `pnpm-lock.yaml` 固定 |

三个镜像仅由 `docker-compose.yml` 引用，本仓库未复制或修改其源码。完整许可见 `THIRD_PARTY_NOTICES.md`。

## 经授权修改

当前仓库没有 vendored 的 LiteLLM、Open WebUI 或 PostgreSQL 源码，也没有把第三方源码修改后提交到本仓库。本类当前为空。通过环境变量设置 Open WebUI 名称属于第三方软件的部署配置，仍受 Open WebUI License 品牌条款约束，不能归类为自主界面源码。

## 计划替换

| 模块 | 优先级 | 验收后目标 |
| --- | --- | --- |
| Open WebUI 核心交互与燕中设计层 | P1/P2 | 自主客户端覆盖登录后首页、对话、文件、搜索、知识库和助手，再将 Open WebUI 降为可替换依赖 |
| Open WebUI 到控制面的用户级归因 | P1/P2 | 自主 AI Web 已使用逐登录应用 Key；Open WebUI 共享服务路径继续隔离，待其能力被自主客户端替换 |
| LiteLLM 数据库内业务配置 | P1 | 渠道与成本配置由自主控制面声明和审计，LiteLLM 仅执行路由 |
| 本机脚本型运维 | P2 | 迁移到可审计的部署流水线、Secret 管理、监控与告警 |

## 已自主实现

| 跟踪范围 | 来源证据 | 当前许可 |
| --- | --- | --- |
| `docker-compose.yml`、`.env.example`、`gateway/config.yaml` | 本仓库从初始提交演进的燕中编排与配置，不包含第三方源码 | 自主内容暂未授予公众许可 |
| `scripts/*.ps1`、`scripts/*.sh` | 本仓库内独立运维、备份、加固和冒烟流程 | 自主内容暂未授予公众许可 |
| `deploy/nginx/**` | 燕中部署边界与反向代理配置 | 自主内容暂未授予公众许可 |
| `README.md`、`docs/**`、治理文件 | 燕中产品、架构、验收、来源和安全文档 | 自主内容暂未授予公众许可 |
| `docs/yancore-subject-grant-client.md` | 燕中主体委托客户端契约，未复制 Open WebUI/New API 实现 | 自主内容暂未授予公众许可 |
| `apps/ai-web/src/**`、`apps/ai-web/Dockerfile` | 独立需求、OIDC/BFF 设计、YanCore 客户端、加密会话、SSE 代理、燕中对话界面和自动化测试 | 自主内容暂未授予公众许可 |
| 根 `package.json`、`pnpm-workspace.yaml` | 燕中自主应用工作区与依赖脚本白名单 | 自主内容暂未授予公众许可 |

“已自主实现”只表示当前 Git 历史与文件内容未显示复制第三方实现，不自动决定权利人、贡献转让或最终开源许可证。

## 更新规则

每次依赖升级、自主模块增加或上游替换都必须更新本矩阵、`THIRD_PARTY_NOTICES.md`、设计/迁移文档、测试证据和回滚 digest。禁止通过改名、格式化或 AI 改写把衍生代码重新标记为原创。
