param(
    [string]$ApiBaseUrl = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "未找到本地 .env 文件：$envFile"
}

function Import-DotEnv {
    Get-Content -LiteralPath $envFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }

        $pair = $line.Split("=", 2)
        $name = $pair[0].Trim()
        $value = $pair[1].Trim()

        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Set-Item -Path "Env:$name" -Value $value
    }
}

function Set-DotEnvValue([string]$Name, [string]$Value) {
    if ($Value.Contains("`r") -or $Value.Contains("`n")) {
        throw "环境变量 $Name 不能包含换行符。"
    }

    $content = [System.IO.File]::ReadAllText($envFile)
    $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
    $line = "$Name=$Value"

    if ([regex]::IsMatch($content, $pattern)) {
        $content = [regex]::Replace($content, $pattern, $line)
    } else {
        if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
            $content += [Environment]::NewLine
        }
        $content += $line + [Environment]::NewLine
    }

    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($envFile, $content, $utf8WithoutBom)
}

function Get-ApiErrorMessage($ErrorRecord) {
    if ($ErrorRecord.ErrorDetails.Message) {
        try {
            $payload = $ErrorRecord.ErrorDetails.Message | ConvertFrom-Json
            if ($payload.error.message) {
                return [string]$payload.error.message
            }
            if ($payload.detail) {
                return [string]$payload.detail
            }
        } catch {
            # 无法解析时使用下面的通用错误，避免意外输出完整响应。
        }
    }

    return $ErrorRecord.Exception.Message
}

Import-DotEnv

if ([string]::IsNullOrWhiteSpace($env:LITELLM_MASTER_KEY)) {
    throw "请先在 .env 中配置 LITELLM_MASTER_KEY。"
}

$baseUrl = if ([string]::IsNullOrWhiteSpace($env:LITELLM_BASE_URL)) {
    "http://localhost:4000"
} else {
    $env:LITELLM_BASE_URL.TrimEnd("/")
}

$upstreamBaseUrl = if (-not [string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
    $ApiBaseUrl.TrimEnd("/")
} elseif (-not [string]::IsNullOrWhiteSpace($env:GPT_IMAGE_API_BASE_URL)) {
    $env:GPT_IMAGE_API_BASE_URL.TrimEnd("/")
} else {
    "https://api.openai.com/v1"
}

$parsedUpstreamUrl = $null
if (-not [uri]::TryCreate($upstreamBaseUrl, [UriKind]::Absolute, [ref]$parsedUpstreamUrl) -or
    $parsedUpstreamUrl.Scheme -ne "https") {
    throw "图片上游地址必须是有效的 HTTPS URL。"
}

$secureKey = Read-Host "请输入图片上游 API Key（输入内容不会显示）" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$upstreamApiKey = $null

try {
    $upstreamApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($upstreamApiKey)) {
        throw "图片上游 API Key 不能为空。"
    }

    $upstreamHeaders = @{ Authorization = "Bearer $upstreamApiKey" }
    try {
        $upstreamModels = Invoke-RestMethod `
            -Uri "$upstreamBaseUrl/models" `
            -Headers $upstreamHeaders `
            -TimeoutSec 60
    } catch {
        $message = Get-ApiErrorMessage $_
        throw "图片上游鉴权或模型列表检查失败：$message"
    }

    $advertisedModelIds = @($upstreamModels.data | ForEach-Object { [string]$_.id })
    if ($advertisedModelIds -notcontains "gpt-image-2") {
        Write-Warning "上游模型列表没有声明 gpt-image-2；将继续注册，并由图片冒烟测试确认实际能力。"
    }

    $adminHeaders = @{
        Authorization = "Bearer $($env:LITELLM_MASTER_KEY)"
        "Content-Type" = "application/json"
    }

    $modelInfo = Invoke-RestMethod -Uri "$baseUrl/model/info" -Headers $adminHeaders -TimeoutSec 30
    $existingModel = $modelInfo.data | Where-Object { $_.model_name -eq "gpt-image-2" } | Select-Object -First 1

    $modelBody = @{
        model_name = "gpt-image-2"
        litellm_params = @{
            model = "openai/gpt-image-2"
            api_base = $upstreamBaseUrl
            api_key = $upstreamApiKey
            # 当前中转站按请求计费，每次只生成一张图。
            input_cost_per_image = 0.1
        }
        model_info = @{
            mode = "image_generation"
        }
    } | ConvertTo-Json -Depth 6

    if ($existingModel) {
        $modelId = [uri]::EscapeDataString([string]$existingModel.model_info.id)
        Invoke-RestMethod `
            -Method Patch `
            -Uri "$baseUrl/model/$modelId/update" `
            -Headers $adminHeaders `
            -Body $modelBody `
            -TimeoutSec 30 | Out-Null
        Write-Output "已更新 LiteLLM 中的 gpt-image-2 上游凭据。"
    } else {
        Invoke-RestMethod `
            -Method Post `
            -Uri "$baseUrl/model/new" `
            -Headers $adminHeaders `
            -Body $modelBody `
            -TimeoutSec 30 | Out-Null
        Write-Output "已在 LiteLLM 中注册 gpt-image-2，上游地址和凭据由 LiteLLM 加密保存。"
    }

    if ([string]::IsNullOrWhiteSpace($env:OPENWEBUI_IMAGE_LITELLM_KEY)) {
        $keyBody = @{
            key_alias = "openwebui-image-generation"
            models = @("gpt-image-2")
            max_budget = 3
            budget_duration = "30d"
            duration = "90d"
            rpm_limit = 2
            max_parallel_requests = 1
            metadata = @{
                purpose = "燕中 AI 内部图片生成"
            }
        } | ConvertTo-Json -Depth 6

        $keyResponse = Invoke-RestMethod `
            -Method Post `
            -Uri "$baseUrl/key/generate" `
            -Headers $adminHeaders `
            -Body $keyBody `
            -TimeoutSec 30

        if ([string]::IsNullOrWhiteSpace([string]$keyResponse.key)) {
            throw "LiteLLM 已注册模型，但没有返回图片专用虚拟 Key。"
        }

        Set-DotEnvValue "OPENWEBUI_IMAGE_LITELLM_KEY" ([string]$keyResponse.key)
        Write-Output "已生成图片专用虚拟 Key，并安全写入本地 .env。"
    } else {
        Write-Output "本地 .env 已有图片专用虚拟 Key，本次继续复用。"
    }
} finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    $upstreamApiKey = $null
    Remove-Variable secureKey -ErrorAction SilentlyContinue
}

Write-Output "配置完成。下一步执行：docker compose up -d --force-recreate open-webui"
Write-Output "然后执行：.\scripts\sync-openwebui-image-config.ps1"
Write-Output "最后执行：.\scripts\image-smoke-test.ps1"
