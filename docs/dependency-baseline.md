# 依赖与部署基线

## 依赖真值

本仓库当前不编译 LiteLLM 或 Open WebUI 源码，也没有 npm、Go 或 Python 应用依赖清单。运行依赖的唯一真值是 `docker-compose.yml` 中固定的镜像摘要：

| 服务 | 固定依据 | 业务边界 |
| --- | --- | --- |
| LiteLLM Database | image digest + `BerriAI/litellm@b3086ccd74553565c9a39716e72303ae985555f9` | 只负责协议、路由、重试和成本采集 |
| Open WebUI | `v0.10.2` image digest + `open-webui/open-webui@ecd48e2f718220a6400ecf49eafd4867a38feb10` | 过渡 AI 客户端，不是自主源码 |
| PostgreSQL | `16.14-alpine` image digest | LiteLLM 数据库，不承载燕中权益真值 |

完整摘要、许可文本和品牌条件见 `THIRD_PARTY_NOTICES.md`。Compose 中不得使用 `latest`，不得只更新可读标签而保留不匹配的摘要。

## 配置顺序

1. 先固定镜像 revision、许可和回滚 digest。
2. 再定义网络、端口、卷、Secret、健康检查、资源与日志上限。
3. 然后配置主站 OIDC 和燕中 API 受限服务 Key。
4. 最后才接入模型与执行聊天、图片、备份和恢复验收。

`.env` 只保存本机或部署环境变量并保持 Git 忽略。上游供应商密钥通过受控配置流程进入 LiteLLM，不写入 `.env`、Compose、脚本参数、终端历史或仓库。

## 变更门禁

镜像升级必须单独提交，并同时提供：

- 新旧标签、digest、源码 revision、发布时间和变更摘要；
- LICENSE、NOTICE、品牌条款与企业目录边界复核；
- `docker compose config --quiet`、健康检查、文本/图片冒烟、重启恢复和备份恢复；
- Open WebUI 持久化配置覆盖环境变量的检查；
- 回滚 digest、数据库兼容性和不可逆迁移说明。

在 Open WebUI 用户级身份归因完成前，共享服务 Key 只记入独立服务账户，不得据此扣减个人权益。在取得书面或企业品牌许可前，还必须保持滚动 30 日直接用户不超过 50 人。
