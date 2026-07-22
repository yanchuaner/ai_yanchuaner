[CmdletBinding()]
param(
  [string]$EnvFile = ".env",
  [switch]$SkipComposeConfig
)

$ErrorActionPreference = "Stop"

function Read-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "找不到环境文件：$Path"
  }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $values[$Matches[1]] = $value
    }
  }
  return $values
}

function Get-Value($Values, [string]$Name) {
  if ($Values.ContainsKey($Name)) { return [string]$Values[$Name] }
  return ""
}

function Assert-Required($Values, [string]$Name) {
  $value = Get-Value $Values $Name
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "缺少 staging 配置：$Name"
  }
  if ($value -match '(?i)(请替换|请填写|replace|example|local-fixture|acceptancepass)') {
    throw "staging 配置仍使用占位值：$Name"
  }
  return $value
}

function Assert-Https([string]$Name, [string]$Value) {
  try { $uri = [Uri]$Value } catch { throw "$Name 不是有效 URL" }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne "https") {
    throw "$Name 必须使用 HTTPS staging URL"
  }
}

$values = Read-DotEnv $EnvFile
$publicUrls = @(
  "AI_WEB_PUBLIC_URL",
  "YANCORE_OIDC_ISSUER",
  "YANCORE_OIDC_DISCOVERY_URL",
  "YANCHUANER_AI_OAUTH_REDIRECT_URI",
  "OPENWEBUI_URL",
  "OPENWEBUI_CORS_ALLOW_ORIGIN"
)
foreach ($name in $publicUrls) {
  Assert-Https $name (Assert-Required $values $name)
}

$secretNames = @(
  "AI_WEB_SESSION_SECRET",
  "YANCORE_OIDC_CLIENT_SECRET",
  "YANCORE_SUBJECT_EXCHANGE_CLIENT_SECRET",
  "YANCHUANER_AI_OAUTH_CLIENT_SECRET",
  "OPENWEBUI_SECRET_KEY",
  "LITELLM_MASTER_KEY",
  "LITELLM_SALT_KEY",
  "LITELLM_UI_PASSWORD",
  "OPENWEBUI_API_KEY",
  "OPENWEBUI_IMAGE_API_KEY",
  "LITELLM_TEST_KEY",
  "LITELLM_TEST_MODEL"
)
foreach ($name in $secretNames) {
  $value = Assert-Required $values $name
  if ($name -ne "LITELLM_TEST_MODEL" -and $value.Length -lt 20) {
    throw "$name 长度不足，拒绝 staging 启动"
  }
}

$clientIds = @(
  (Assert-Required $values "YANCORE_OIDC_CLIENT_ID"),
  (Assert-Required $values "YANCHUANER_AI_OAUTH_CLIENT_ID"),
  (Assert-Required $values "YANCORE_SUBJECT_EXCHANGE_CLIENT_ID")
)
if (($clientIds | Select-Object -Unique).Count -ne $clientIds.Count) {
  throw "New API、Open WebUI 和自主 AI Web 不得复用 OAuth client ID"
}

$insecureHttp = (Get-Value $values "AI_WEB_ALLOW_INSECURE_INTERNAL_HTTP").ToLowerInvariant()
if ($insecureHttp -eq "true") {
  throw "staging 禁止 AI_WEB_ALLOW_INSECURE_INTERNAL_HTTP=true"
}

$bind = Get-Value $values "LITELLM_HOST_BIND"
if ($bind -and $bind -notin @("127.0.0.1", "localhost")) {
  throw "LiteLLM 管理端必须只绑定本机，由反向代理暴露 HTTPS"
}

$providerKeys = @("OPENAI_API_KEY", "DEEPSEEK_API_KEY") | Where-Object {
  $value = Get-Value $values $_
  -not [string]::IsNullOrWhiteSpace($value) -and $value -notmatch '(?i)(请替换|请填写|replace|example|fixture)'
}
if ($providerKeys.Count -lt 1) {
  throw "staging 至少需要一个真实 OpenAI 或 DeepSeek 凭据"
}
foreach ($keyName in $providerKeys) {
  $baseName = if ($keyName -eq "OPENAI_API_KEY") { "OPENAI_API_BASE_URL" } else { "DEEPSEEK_API_BASE_URL" }
  Assert-Https $baseName (Assert-Required $values $baseName)
}

if (-not $SkipComposeConfig) {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { throw "找不到 Docker，无法验证 Compose 配置" }
  & $docker.Source compose --env-file $EnvFile config --quiet
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose staging 配置无效" }
}

Write-Output "Staging 配置门禁通过：HTTPS、Secret 占位符、OAuth 客户端隔离、生产 HTTP 禁用、供应商凭据和 Compose 配置均符合要求。"
