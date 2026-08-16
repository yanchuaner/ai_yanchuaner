# 安全

仓库级漏洞披露与发布门禁见根 [SECURITY.md](../SECURITY.md)。本文描述系统安全边界。

## 信任边界

- 主站是唯一身份源；AI 不提供本地密码注册，不复制用户表，不自行提升角色。
- 浏览器只持有加密、`HttpOnly`、`Secure`、`SameSite=Lax` 的站点会话，不接触 YanCore grant、应用 Key 或供应商凭据。
- 所有付费模型/嵌入调用进入 `api.yanchuaner.cn`；鉴权、策略与计费错误不得吞掉。
- Open WebUI 与 LiteLLM 是内网过渡/设施组件，不定义公网产品权限。

## 凭据

- 生产 Secret 只从受控 `.env` 注入，不进入仓库、镜像、日志或客户端响应；镜像构建已验证无 `.env` 文件与 Secret 环境变量。
- OIDC 客户端、Subject Exchange 客户端、Open WebUI 客户端与设施管理员使用不同凭据。
- 用户自配媒体/语音凭据（BYOK）用 AES-256-GCM 加密落盘，按用户隔离，只在对应适配器调用时解密，可删除。
- 日志默认不记录消息正文、知识片段、上传内容、Cookie、Authorization、grant、Key。

## 访问控制

- 管理员接口（额度、观测查询）使用 `requireAiSession` + `role === "admin"`。
- 业务路由一律使用 `session.subject.userId` 作为 owner 条件，不信任客户端传入的 userId。
- 对话入口校验 `Origin`，Cookie `SameSite=Lax` 提供 CSRF 缓解。

## 数据安全

- 数据卷按用户隔离；生产与开发数据不互换。
- 删除用户数据时同时处理权威数据与派生索引（知识向量、记忆）。
- BYOK 删除后不可经 API 恢复。

## 发布安全门禁

发布前至少验证：OIDC/PKCE、Cookie/CSRF、主体越权、撤销、受限 Key、流式取消、文件导入边界、备份恢复、依赖审计与镜像无 Secret。
