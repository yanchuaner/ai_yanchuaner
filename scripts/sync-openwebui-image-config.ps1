$ErrorActionPreference = "Stop"

$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) {
    $fallback = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    if (Test-Path -LiteralPath $fallback) {
        $docker = $fallback
    } else {
        throw "未找到 Docker 命令。请启动 Docker Desktop 并重新打开 PowerShell。"
    }
}

$services = & $docker compose ps --status running --services
if ($LASTEXITCODE -ne 0 -or "open-webui" -notin $services) {
    throw "Open WebUI 未运行。请先执行 docker compose up -d。"
}

$pythonCode = @'
import asyncio
import os

from open_webui.models.config import Config

image_key = os.environ.get("IMAGES_OPENAI_API_KEY", "").strip()
if not image_key:
    raise RuntimeError("容器中缺少 IMAGES_OPENAI_API_KEY")

asyncio.run(
    Config.upsert(
        {
            "image_generation.enable": True,
            "image_generation.engine": "openai",
            "image_generation.model": "gpt-image-2",
            "image_generation.size": "1024x1024",
            "image_generation.prompt.enable": False,
            "image_generation.openai.api_base_url": "http://litellm:4000/v1",
            "image_generation.openai.api_key": image_key,
            "image_generation.openai.params": {"quality": "low"},
        }
    )
)
'@

& $docker compose exec -T open-webui python3 -c $pythonCode
if ($LASTEXITCODE -ne 0) {
    throw "同步 Open WebUI 图片配置失败。"
}

Write-Output "Open WebUI 图片配置同步完成"
Write-Output "图片模型：gpt-image-2"
Write-Output "默认尺寸：1024x1024"
Write-Output "默认质量：low"
