#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

docker compose config --quiet
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:4000/health/liveliness >/dev/null
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:3000/health >/dev/null

running_services="$(docker compose ps --status running --services)"
for service in db litellm open-webui; do
  if ! grep -qx "$service" <<<"$running_services"; then
    echo "服务未运行：$service" >&2
    exit 1
  fi
done

echo "燕中 AI 服务健康"
