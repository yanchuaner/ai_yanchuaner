# API 平台集成

燕中 AI 保留唯一 LiteLLM 数据面和 Open WebUI。所有面向用户、工作台和 Agent 的调用先经过 `api_yanchuaner` 中的 New API 控制面，再由受限内部渠道进入 LiteLLM。

```text
Open WebUI / Agent / 校友 API Key
              |
              v
      New API (api-gateway)
              |
              v
     LiteLLM (litellm-gateway)
              |
              v
       获授权的官方模型
```

两个仓库通过外部 Docker 网络 `yanchuaner-ai-core` 连接。Open WebUI 使用 New API 签发的独立服务 Token，不再直接使用 LiteLLM 虚拟 Key；LiteLLM master key 仍只用于本地管理。

用户身份由主站统一提供。Open WebUI 关闭本地注册，通过主站 OIDC 自动创建已认证校友账号；API 平台使用同一身份源的独立 OAuth 客户端，两个下游互不复用客户端密钥。容器内通过 `host.docker.internal` 访问主站的发现、令牌和用户信息端点，浏览器授权与回调仍使用 `localhost` 或正式 HTTPS 域名。

启动顺序由 `api_yanchuaner/scripts/bootstrap-integrated-stack.ps1` 统一处理。单独启动本仓库前，必须确保外部网络和 `api-gateway` 已存在，否则 Open WebUI 虽可启动但不能调用模型。

## 当前归因边界

Open WebUI 目前使用一个受限服务 Key 调用燕中 API。OIDC 能证明用户登录 Open WebUI，但 Open WebUI 的模型请求尚未向控制面传递可验证的用户主体，因此服务 Key 日志不能直接作为个人权益扣减依据。预览发布前必须选择并验收用户级令牌交换或可信身份透传；在此之前，AI 工作台用量只能记入独立服务账户，不得静默扣减个人公益额度。

## 第三方与品牌边界

LiteLLM 和 Open WebUI 均是外部依赖，不属于燕中自主业务代码。固定镜像、源码 revision、许可全文与 Open WebUI 品牌限制见 `THIRD_PARTY_NOTICES.md`；替换路线见 `docs/copyright-matrix.md`。未取得 Open WebUI 书面或企业许可时，燕中品牌部署必须保持滚动 30 日直接用户不超过 50 人。
