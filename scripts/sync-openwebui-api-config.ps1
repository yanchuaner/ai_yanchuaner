$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $projectRoot "docker-compose.yml"

$services = docker compose --project-directory $projectRoot -f $composeFile ps --status running --services
if ($LASTEXITCODE -ne 0 -or "open-webui" -notin $services) {
  throw "Open WebUI 未运行。"
}

$pythonCode = @'
import asyncio
import os

from open_webui.models.config import Config

api_base = os.environ.get("OPENAI_API_BASE_URL", "").strip()
api_key = os.environ.get("OPENAI_API_KEY", "").strip()
image_base = os.environ.get("IMAGES_OPENAI_API_BASE_URL", api_base).strip()
image_key = os.environ.get("IMAGES_OPENAI_API_KEY", api_key).strip()
if not api_base or not api_key:
    raise RuntimeError("Open WebUI API gateway configuration is incomplete")

asyncio.run(
    Config.upsert(
        {
            "openai.api_base_urls": [api_base],
            "openai.api_keys": [api_key],
            "image_generation.enable": True,
            "image_generation.engine": "openai",
            "image_generation.model": "gpt-image-2",
            "image_generation.size": "1024x1024",
            "image_generation.prompt.enable": False,
            "image_generation.openai.api_base_url": image_base,
            "image_generation.openai.api_key": image_key,
            "image_generation.openai.params": {"quality": "low"},
        }
    )
)
'@

docker compose --project-directory $projectRoot -f $composeFile exec -T open-webui python3 -c $pythonCode
if ($LASTEXITCODE -ne 0) { throw "同步 Open WebUI API 平台配置失败。" }

Write-Output "Open WebUI 已切换到 New API 控制面。"
