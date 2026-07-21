# 依赖与部署基线

## 依赖真值

本仓库不编译 LiteLLM 或 Open WebUI 源码。第三方镜像的运行真值是 `docker-compose.yml` 中固定的摘要；自主 AI Web 的 npm 依赖真值是 `apps/ai-web/package.json` 与 `pnpm-lock.yaml`：

| 服务 | 固定依据 | 业务边界 |
| --- | --- | --- |
| LiteLLM Database | image digest + `BerriAI/litellm@b3086ccd74553565c9a39716e72303ae985555f9` | 只负责协议、路由、重试和成本采集 |
| Open WebUI | `v0.10.2` image digest + `open-webui/open-webui@ecd48e2f718220a6400ecf49eafd4867a38feb10` | 过渡 AI 客户端，不是自主源码 |
| PostgreSQL | `16.14-alpine` image digest | LiteLLM 数据库，不承载燕中权益真值 |
| Next.js / React | `15.5.19` / `18.3.1` | 自主 AI Web 框架，不承载身份或额度真值 |
| openid-client | `6.8.4` | OpenID 认证客户端与 ID Token 验证，不定义 YanCore 业务协议 |
| Lucide React | `0.542.0` | 工作台图标，不构成燕中品牌资产 |
| Node.js 官方镜像 | `22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3` | AI Web 构建与运行时；升级时同步复核基础 Debian 包 |

完整摘要、许可文本和品牌条件见 `THIRD_PARTY_NOTICES.md`。Compose 中不得使用 `latest`，不得只更新可读标签而保留不匹配的摘要。

## 配置顺序

1. 先固定镜像 revision、许可和回滚 digest。
2. 再定义网络、端口、卷、Secret、健康检查、资源与日志上限。
3. 然后配置主站 OIDC、关闭 Open WebUI 本地密码入口并启用受信任角色声明，再配置燕中 API 受限服务 Key。
4. 自主 AI Web 先完成 OIDC、加密会话和 YanCore 主体交换。
5. 最后才接入模型与执行聊天、图片、额度、备份和恢复验收。

pnpm 安装脚本仅批准 `esbuild` 与 `sharp`，`allowBuilds` 之外的依赖脚本默认拒绝。新增依赖必须先记录必要性、版本、许可证和运行边界，再更新锁文件。
`postcss` 由工作区覆盖到 `8.5.10`，用于修复 `GHSA-qx2v-qp2m-jg93`；升级 Next.js 时必须复核该覆盖是否仍需要。

`.env` 只保存本机或部署环境变量并保持 Git 忽略。上游供应商密钥通过受控配置流程进入 LiteLLM，不写入 `.env`、Compose、脚本参数、终端历史或仓库。

## 变更门禁

镜像升级必须单独提交，并同时提供：

- 新旧标签、digest、源码 revision、发布时间和变更摘要；
- LICENSE、NOTICE、品牌条款与企业目录边界复核；
- `docker compose config --quiet`、健康检查、文本/图片冒烟、重启恢复和备份恢复；
- Open WebUI 持久化配置覆盖环境变量的检查；
- Open WebUI `enable_signup=false`、`enable_login_form=false`、密码接口 403、OIDC 角色白名单和受控首次管理员引导；
- Open WebUI 与自主 AI Web 的 client ID、Secret、精确回调互相隔离，YanCore 主体交换再使用独立 Secret；
- 回滚 digest、数据库兼容性和不可逆迁移说明。

在 Open WebUI 用户级身份归因完成前，共享服务 Key 只记入独立服务账户，不得据此扣减个人权益。在取得书面或企业品牌许可前，还必须保持滚动 30 日直接用户不超过 50 人。
