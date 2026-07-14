$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "未找到本地 .env 文件：$envFile"
}

# 只把本地变量加载到当前进程，不输出任何值。
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

$requiredVariables = @(
    "LITELLM_MASTER_KEY",
    "OPENWEBUI_LITELLM_KEY",
    "OPENWEBUI_IMAGE_LITELLM_KEY"
)
$missingVariables = $requiredVariables | Where-Object {
    [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
}
if ($missingVariables) {
    throw "以下变量未配置：$($missingVariables -join ', ')"
}

$baseUrl = if ([string]::IsNullOrWhiteSpace($env:LITELLM_BASE_URL)) {
    "http://localhost:4000"
} else {
    $env:LITELLM_BASE_URL.TrimEnd("/")
}

$headers = @{
    Authorization = "Bearer $($env:LITELLM_MASTER_KEY)"
    "Content-Type" = "application/json"
}

$policies = @(
    @{
        Name = "Open WebUI 文本 Key"
        Body = @{
            key = $env:OPENWEBUI_LITELLM_KEY
            duration = "90d"
            models = @("deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro")
            max_budget = 5
            budget_duration = "30d"
            rpm_limit = 20
            tpm_limit = 20000
        }
    },
    @{
        Name = "Open WebUI 图片 Key"
        Body = @{
            key = $env:OPENWEBUI_IMAGE_LITELLM_KEY
            duration = "90d"
            models = @("gpt-image-2")
            max_budget = 5
            budget_duration = "30d"
            rpm_limit = 2
            max_parallel_requests = 1
        }
    }
)

foreach ($policy in $policies) {
    Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/key/update" `
        -Headers $headers `
        -Body ($policy.Body | ConvertTo-Json -Depth 5) `
        -TimeoutSec 30 | Out-Null
    Write-Output "$($policy.Name)：已设置为 90 天有效期和月度预算"
}

Write-Output "暑期运行策略同步完成"
