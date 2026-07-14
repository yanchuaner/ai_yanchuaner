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
    "LITELLM_TEST_KEY",
    "LITELLM_TEST_MODEL",
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

# LiteLLM 以美元统计成本。DeepSeek 上游以人民币报价，这里固定按
# 1 USD = 7.0 CNY 保守换算，让预算统计略高于近期实际汇率换算值。
$cnyPerUsd = 7.0
$modelPolicies = @(
    @{
        Name = "deepseek/deepseek-v4-flash"
        Costs = @{
            input_cost_per_token = 1 / 1000000 / $cnyPerUsd
            cache_read_input_token_cost = 0.02 / 1000000 / $cnyPerUsd
            input_cost_per_token_cache_hit = 0.02 / 1000000 / $cnyPerUsd
            output_cost_per_token = 2 / 1000000 / $cnyPerUsd
        }
    },
    @{
        Name = "deepseek/deepseek-v4-pro"
        Costs = @{
            input_cost_per_token = 3 / 1000000 / $cnyPerUsd
            cache_read_input_token_cost = 0.025 / 1000000 / $cnyPerUsd
            input_cost_per_token_cache_hit = 0.025 / 1000000 / $cnyPerUsd
            output_cost_per_token = 6 / 1000000 / $cnyPerUsd
        }
    },
    @{
        Name = "gpt-image-2"
        Costs = @{
            input_cost_per_image = 0.1
        }
    }
)

$modelInfo = Invoke-RestMethod `
    -Method Get `
    -Uri "$baseUrl/model/info" `
    -Headers $headers `
    -TimeoutSec 30

foreach ($modelPolicy in $modelPolicies) {
    $storedModel = $modelInfo.data |
        Where-Object { $_.model_name -eq $modelPolicy.Name } |
        Select-Object -First 1
    if (-not $storedModel -or [string]::IsNullOrWhiteSpace([string]$storedModel.model_info.id)) {
        throw "LiteLLM 中未找到模型：$($modelPolicy.Name)"
    }

    $modelId = [uri]::EscapeDataString([string]$storedModel.model_info.id)
    $modelBody = @{
        litellm_params = $modelPolicy.Costs
    } | ConvertTo-Json -Depth 5
    Invoke-RestMethod `
        -Method Patch `
        -Uri "$baseUrl/model/$modelId/update" `
        -Headers $headers `
        -Body $modelBody `
        -TimeoutSec 30 | Out-Null
    Write-Output "$($modelPolicy.Name)：成本规则已同步"
}

$policies = @(
    @{
        Name = "自动巡检测试 Key"
        Body = @{
            key = $env:LITELLM_TEST_KEY
            duration = "90d"
            models = @($env:LITELLM_TEST_MODEL)
            max_budget = 1
            budget_duration = "30d"
            rpm_limit = 5
            tpm_limit = 5000
        }
    },
    @{
        Name = "Open WebUI 文本 Key"
        Body = @{
            key = $env:OPENWEBUI_LITELLM_KEY
            duration = "90d"
            models = @("deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro")
            max_budget = 3
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
            max_budget = 3
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

Write-Output "暑期运行策略同步完成：文本 3 美元/月，图片 3 美元/月，巡检 1 美元/月"
