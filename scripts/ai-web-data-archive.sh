#!/usr/bin/env bash
set -Eeuo pipefail

# ai-web 用户数据卷的归档/恢复 helper。
# 用法：ai-web-data-archive.sh <create|restore> <归档文件> [卷名] [镜像]
# 卷名默认 ai-yanchuaner_ai_web_data，可用 AI_WEB_VOLUME 覆盖；
# 镜像默认 ai-yanchuaner/ai-web:preview，可用 AI_WEB_IMAGE 覆盖。

mode="${1:-}"
archive="${2:-}"
volume="${3:-${AI_WEB_VOLUME:-ai-yanchuaner_ai_web_data}}"
image="${4:-${AI_WEB_IMAGE:-ai-yanchuaner/ai-web:preview}}"

if [[ "$mode" != "create" && "$mode" != "restore" ]] || [[ -z "$archive" ]]; then
  echo "用法：$0 <create|restore> <归档文件> [卷名] [镜像]" >&2
  exit 2
fi

case "$mode" in
  create)
    docker run --rm --name "ai-web-archive-$$" \
      -v "${volume}:/data:ro" \
      --entrypoint sh "${image}" \
      -c 'tar -C /data -czf - .' > "$archive"
    ;;
  restore)
    docker run --rm -i --name "ai-web-archive-$$" \
      -v "${volume}:/data" \
      --entrypoint sh "${image}" \
      -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -C /data -xzf -' \
      < "$archive"
    ;;
esac
