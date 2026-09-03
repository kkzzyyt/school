#!/usr/bin/env bash

set -Eeuo pipefail

IMAGE_REF="${DOCKER_SMOKE_IMAGE:-school:ci}"
SMOKE_PORT="${DOCKER_SMOKE_PORT:-3101}"
CONTAINER_NAME="school-docker-smoke-$$"
SMOKE_DATABASE_URL='mysql://school:smoke@127.0.0.1:9/school'
CONTAINER_STARTED=false

fail() {
  printf 'Docker 运行时冒烟测试失败：%s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

require_command curl
require_command docker

[[ "$IMAGE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:-]*$ ]] || fail 'DOCKER_SMOKE_IMAGE 格式非法'
[[ "$SMOKE_PORT" =~ ^[0-9]+$ ]] || fail 'DOCKER_SMOKE_PORT 必须是数字'
(( SMOKE_PORT >= 1024 && SMOKE_PORT <= 65535 )) || fail 'DOCKER_SMOKE_PORT 必须在 1024 到 65535 之间'

docker image inspect "$IMAGE_REF" >/dev/null 2>&1 || fail "镜像不存在：$IMAGE_REF"

cleanup() {
  local exit_code=$?
  trap - EXIT HUP INT TERM
  set +e
  if [[ "$CONTAINER_STARTED" == true ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

docker run --detach \
  --name "$CONTAINER_NAME" \
  --publish "127.0.0.1:$SMOKE_PORT:3000" \
  --env "DATABASE_URL=$SMOKE_DATABASE_URL" \
  --env NODE_ENV=production \
  --env HOSTNAME=0.0.0.0 \
  --env PORT=3000 \
  --env NEXT_TELEMETRY_DISABLED=1 \
  "$IMAGE_REF" >/dev/null
CONTAINER_STARTED=true

http_status='000'
for (( attempt = 1; attempt <= 30; attempt += 1 )); do
  http_status="$(curl -sS --max-time 3 --output /dev/null --write-out '%{http_code}' -- "http://127.0.0.1:$SMOKE_PORT/api/health" 2>/dev/null || true)"
  if [[ "$http_status" == 503 ]]; then
    break
  fi
  running="$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || printf 'false')"
  if [[ "$running" != true ]]; then
    break
  fi
  sleep 1
done

login_status="$(curl -sS --max-time 3 --output /dev/null --write-out '%{http_code}' \
  -X POST \
  -H 'Origin: http://127.0.0.1:'"$SMOKE_PORT" \
  -H 'Content-Type: application/json' \
  --data '{}' \
  -- "http://127.0.0.1:$SMOKE_PORT/api/auth/login" 2>/dev/null || true)"
if [[ "$http_status" == 503 && "$login_status" == 400 ]]; then
  printf '%s\n' 'Docker 运行时冒烟测试通过'
  exit 0
fi

printf '健康接口未返回预期 HTTP 503，实际为 %s\n' "${http_status:-000}" >&2
printf '登录路由未返回预期 HTTP 400，实际为 %s\n' "${login_status:-000}" >&2
docker logs "$CONTAINER_NAME" 2>&1 | sed -n '1,160p' >&2 || true
fail 'Docker standalone 应用未正常启动'
