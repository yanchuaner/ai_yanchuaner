#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

docker compose config --quiet
curl --fail --silent --show-error --max-time 10 \
  --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
  http://127.0.0.1:4000/health/liveliness >/dev/null

openwebui_address="$(docker compose port open-webui 8080 | head -n 1)"
if [[ -z "$openwebui_address" ]]; then
  echo "无法读取 Open WebUI 的宿主机端口" >&2
  exit 1
fi
curl --fail --silent --show-error --max-time 10 \
  --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors \
  "http://$openwebui_address/health" >/dev/null

running_services="$(docker compose ps --status running --services)"
for service in db litellm open-webui; do
  if ! grep -qx "$service" <<<"$running_services"; then
    echo "服务未运行：$service" >&2
    exit 1
  fi
done

echo "燕中 AI 服务健康"
