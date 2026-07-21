# 阶段 3C：Open WebUI OIDC 消费端验收

更新日期：2026-07-21

## 目标与边界

Open WebUI `0.10.2` 是明确标识的第三方过渡客户端。本阶段不修改或声明其源码版权，只固定部署配置并验证主站是唯一身份源：本地登录表单、密码鉴权、本地注册和首次本地管理员注册全部关闭，成员通过独立的 `ai-yanchuaner` OIDC 客户端登录。

主站 `role` 声明是角色真值：`admin` 对应 Open WebUI 管理员，`alumni`、`student`、`teacher` 对应普通用户。其他角色由主站授权边界或 Open WebUI OAuth allowlist 拒绝。

## 首次管理员边界

Open WebUI 上游实现会把全新数据库中的首个 OAuth 用户提升为管理员，该逻辑先于 OAuth 角色管理。空数据卷首次启动时必须满足以下顺序：

1. 只绑定 `127.0.0.1`，不开放 Nginx 或公网入口。
2. 由受信任的主站管理员首先完成 OIDC 登录。
3. 运行 `scripts/verify-openwebui-oidc-callback.ps1 -AllowLocalMutation`。
4. 确认管理员角色、校友普通角色和本地入口拒绝后，才允许开放反向代理。

若普通成员抢先成为首个用户，立即停止服务并销毁尚未承载真实数据的初始化卷，然后按上述顺序重建；不得仅依赖界面隐藏掩盖错误管理员。

## 自动验收

脚本默认使用主站 `http://localhost:3000` 和 Open WebUI `http://localhost:3001`，只接受回环地址，并要求显式传入 `-AllowLocalMutation`。它执行：

- 读取 `/api/config`，确认 OIDC provider 存在且本地注册、登录表单关闭；
- 调用 signin/signup API，确认服务端均返回 403；
- 以主站管理员完成真实授权码回调，读取管理员 OAuth 配置确认角色声明和 allowlist；
- 以校友完成两次独立会话登录，确认复用同一 Open WebUI 用户且角色为 `user`；
- 全程不打印授权码、访问令牌、会话 Cookie 或密码。

2026-07-21 的 WSL + Docker Desktop 隔离环境已使用固定镜像摘要、全新 Open WebUI SQLite 卷和主站隔离 SQLite/Redis 完成实跑。最终证据以脚本输出、Compose 解析、容器健康状态和 Git 提交为准。

## 回滚

回滚本阶段配置时停止 Open WebUI，恢复上一固定 Compose revision 并保留已有数据卷。只有明确标记为一次性验收的 Compose project 可以执行 `down -v`。回滚不得开放公网本地密码入口；若旧版本必须临时恢复密码鉴权，只能在回环地址和维护窗口内完成，并在重新开放流量前再次关闭。
