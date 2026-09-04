#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 10 ]]; then
  printf 'remote-deploy-docker-registry.sh 参数数量错误：期望 10，实际 %s\n' "$#" >&2
  exit 2
fi

DEPLOY_PATH="$1"
COMPOSE_UPLOAD_PATH="$2"
RELEASE_ID="$3"
ENV_PATH="$4"
PROJECT_NAME="$5"
HEALTHCHECK_URL="$6"
KEEP_RELEASES="$7"
IMAGE_REF="$8"
LEGACY_SERVICE_NAME="$9"
IMAGE_PULL_TIMEOUT_SECONDS="${10}"
IMAGE_PULL_ATTEMPTS=2

die() {
  printf 'Docker 远程部署失败：%s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

validate_path() {
  local name="$1"
  local value="$2"

  [[ "$value" == /* ]] || die "$name 必须是绝对路径"
  [[ "$value" != *[[:space:]]* ]] || die "$name 不能包含空格或换行"
  [[ "$value" != *'//' && "$value" != *'/./'* && "$value" != */. ]] || die "$name 不能包含非法路径段"
  [[ "$value" != *'/../'* && "$value" != */.. ]] || die "$name 不能包含 .."
  [[ "$value" != */ ]] || die "$name 不能以 / 结尾"
}

validate_integer() {
  local name="$1"
  local value="$2"

  [[ "$value" =~ ^[0-9]+$ ]] || die "$name 必须是数字"
}

validate_path "部署目录" "$DEPLOY_PATH"
validate_path "Compose 文件路径" "$COMPOSE_UPLOAD_PATH"
validate_path ".env 路径" "$ENV_PATH"
[[ "$DEPLOY_PATH" != / ]] || die "部署目录不能使用文件系统根目录"
[[ "$ENV_PATH" == "$DEPLOY_PATH"/* ]] || die ".env 必须位于部署目录内"
validate_integer "保留 release 数量" "$KEEP_RELEASES"
(( KEEP_RELEASES >= 1 )) || die "保留 release 数量至少为 1"
validate_integer "镜像拉取超时时间" "$IMAGE_PULL_TIMEOUT_SECONDS"
(( IMAGE_PULL_TIMEOUT_SECONDS >= 30 && IMAGE_PULL_TIMEOUT_SECONDS <= 1800 )) || die "镜像拉取超时时间必须在 30 到 1800 秒之间"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || die "release id 非法"
[[ "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]+$ ]] || die "Compose 项目名非法"
[[ "$IMAGE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:-]*$ ]] || die "镜像引用非法"
[[ "$HEALTHCHECK_URL" != "" && "$HEALTHCHECK_URL" != *[[:space:]]* ]] || die "健康检查 URL 非法"
if [[ -n "$LEGACY_SERVICE_NAME" ]]; then
  [[ "$LEGACY_SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ && "$LEGACY_SERVICE_NAME" != -* ]] || die "旧 systemd 服务名非法"
fi

case "$COMPOSE_UPLOAD_PATH" in
  "$DEPLOY_PATH/.deploy/incoming/"*) ;;
  *) die "Compose 文件路径不在受控 incoming 目录中" ;;
esac

COMPOSE_NAME="$(basename "$COMPOSE_UPLOAD_PATH")"
[[ "$COMPOSE_NAME" == docker-compose.production.yml || "$COMPOSE_NAME" =~ ^docker-compose[.]production-[A-Za-z0-9._-]+[.]yml$ ]] || die "Compose 文件名非法"
[[ -f "$COMPOSE_UPLOAD_PATH" ]] || die "Compose 文件不存在：$COMPOSE_UPLOAD_PATH"
[[ -f "$ENV_PATH" ]] || die "运行时 .env 不存在：$ENV_PATH"
[[ -d "$DEPLOY_PATH" ]] || die "部署目录不存在：$DEPLOY_PATH"

for command_name in bash cp curl docker head ln ls mkdir mv readlink rm sed sleep timeout; do
  require_command "$command_name"
done
docker compose version >/dev/null 2>&1 || die 'Docker Compose 插件不可用'

DEPLOY_STATE_DIR="$DEPLOY_PATH/.deploy"
DOCKER_STATE_DIR="$DEPLOY_STATE_DIR/docker"
RELEASES_DIR="$DOCKER_STATE_DIR/releases"
LOCK_DIR="$DOCKER_STATE_DIR/lock"
CURRENT_LINK="$DOCKER_STATE_DIR/current"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
RELEASE_COMPOSE_PATH="$RELEASE_DIR/docker-compose.production.yml"
RELEASE_IMAGE_PATH="$RELEASE_DIR/image-ref"
PREVIOUS_RELEASE_DIR=""
PREVIOUS_IMAGE_REF=""
APP_SWITCH_ATTEMPTED=false
CURRENT_LINK_UPDATED=false
LEGACY_WAS_ACTIVE=false
LEGACY_WAS_ENABLED=false
LEGACY_STOPPED=false

[[ ! -e "$RELEASE_DIR" ]] || die "release 已存在：$RELEASE_DIR"
[[ ! -e "$LOCK_DIR" ]] || die "已有 Docker 部署正在进行，或存在遗留锁：$LOCK_DIR"
if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  die "当前 release 路径已存在且不是符号链接"
fi

find_previous_release_from_container() {
  local container_id
  local active_image
  local candidate
  local candidate_image

  [[ -e "$CURRENT_LINK" || -L "$CURRENT_LINK" ]] && return 0
  container_id="$(find_app_container_id)"
  [[ -n "$container_id" ]] || return 0
  active_image="$(docker inspect --format '{{.Config.Image}}' "$container_id")"

  for candidate in "$RELEASES_DIR"/*/; do
    [[ -d "$candidate" && -f "$candidate/image-ref" ]] || continue
    candidate="${candidate%/}"
    candidate_image="$(sed -n '1p' "$candidate/image-ref")"
    if [[ "$candidate_image" == "$active_image" ]]; then
      PREVIOUS_RELEASE_DIR="$candidate"
      PREVIOUS_IMAGE_REF="$candidate_image"
      break
    fi
  done
}

if [[ -e "$CURRENT_LINK" || -L "$CURRENT_LINK" ]]; then
  CURRENT_TARGET="$(readlink "$CURRENT_LINK")"
  case "$CURRENT_TARGET" in
    "$RELEASES_DIR/"*) ;;
    *) die "当前 release 符号链接指向受控目录之外" ;;
  esac
  [[ -d "$CURRENT_TARGET" ]] || die "当前 release 目录不存在：$CURRENT_TARGET"
  [[ -f "$CURRENT_TARGET/image-ref" ]] || die "当前 release 缺少 image-ref：$CURRENT_TARGET"
  PREVIOUS_RELEASE_DIR="$CURRENT_TARGET"
  PREVIOUS_IMAGE_REF="$(sed -n '1p' "$CURRENT_TARGET/image-ref")"
fi

find_app_container_id() {
  docker ps \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter 'label=com.docker.compose.service=app' \
    --filter 'label=com.docker.compose.oneoff=False' \
    --format '{{.ID}}' | head -n 1
}

# 兼容此前由手工 Compose 启动、但尚未建立 current 指针的服务器。
find_previous_release_from_container
if [[ -n "$PREVIOUS_IMAGE_REF" ]]; then
  [[ "$PREVIOUS_IMAGE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:-]*$ ]] || die "当前 release 的镜像引用非法"
  docker image inspect "$PREVIOUS_IMAGE_REF" >/dev/null || die "当前 release 的 Docker 镜像不存在：$PREVIOUS_IMAGE_REF"
fi

mkdir -p "$RELEASES_DIR"
mkdir "$LOCK_DIR"
printf '%s\n' "$$" > "$LOCK_DIR/pid"

run_compose() {
  local compose_path="$1"
  local image_ref="$2"
  shift 2

  SCHOOL_IMAGE="$image_ref" \
    SCHOOL_RUNTIME_ENV_FILE="$ENV_PATH" \
    docker compose -f "$compose_path" -p "$PROJECT_NAME" "$@"
}

pull_image() {
  local attempt

  for (( attempt = 1; attempt <= IMAGE_PULL_ATTEMPTS; attempt += 1 )); do
    printf '拉取 Docker 镜像（第 %s/%s 次，超时 %s 秒）：%s\n' \
      "$attempt" "$IMAGE_PULL_ATTEMPTS" "$IMAGE_PULL_TIMEOUT_SECONDS" "$IMAGE_REF"
    if timeout "$IMAGE_PULL_TIMEOUT_SECONDS" docker pull --platform linux/amd64 "$IMAGE_REF"; then
      return 0
    fi
    if (( attempt < IMAGE_PULL_ATTEMPTS )); then
      printf '%s\n' '镜像拉取失败，5 秒后重试。' >&2
      sleep 5
    fi
  done

  die "镜像拉取失败或超时：$IMAGE_REF"
}

wait_for_health() {
  local url="$1"
  local last_status='无响应'
  local http_status

  for (( attempt = 1; attempt <= 30; attempt += 1 )); do
    http_status="$(curl -fsS --max-time 3 --output /dev/null --write-out '%{http_code}' -- "$url" 2>/dev/null || true)"
    if [[ "$http_status" =~ ^[0-9]{3}$ ]]; then
      last_status="$http_status"
    fi
    if [[ "$http_status" == 200 ]]; then
      return 0
    fi
    sleep 1
  done

  printf '健康检查最终状态：HTTP %s\n' "$last_status" >&2
  return 1
}

verify_active_image() {
  local container_id
  local active_image
  local expected_image_ref

  container_id="$(find_app_container_id)"
  [[ -n "$container_id" ]] || die "未找到运行中的 app 容器"
  active_image="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
  expected_image_ref="$IMAGE_REF"
  if [[ "$active_image" != "$expected_image_ref" ]]; then
    printf '运行中的镜像不匹配：期望 %s，实际 %s\n' "$expected_image_ref" "$active_image" >&2
    die "运行中的镜像不匹配"
  fi
}

restore_previous() {
  local restore_status=0

  if [[ "$APP_SWITCH_ATTEMPTED" == true ]]; then
    run_compose "$RELEASE_COMPOSE_PATH" "$IMAGE_REF" down --remove-orphans >/dev/null 2>&1 || true
  fi

  if [[ "$CURRENT_LINK_UPDATED" == true ]]; then
    rm -f "$CURRENT_LINK" || restore_status=1
    if [[ -n "$PREVIOUS_RELEASE_DIR" ]]; then
      ln -s "$PREVIOUS_RELEASE_DIR" "$CURRENT_LINK" || restore_status=1
    fi
    CURRENT_LINK_UPDATED=false
  elif [[ -n "$PREVIOUS_RELEASE_DIR" && ! -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
    ln -s "$PREVIOUS_RELEASE_DIR" "$CURRENT_LINK" || restore_status=1
  fi

  if [[ -n "$PREVIOUS_RELEASE_DIR" ]]; then
    run_compose "$PREVIOUS_RELEASE_DIR/docker-compose.production.yml" "$PREVIOUS_IMAGE_REF" \
      up --detach --no-deps --force-recreate app >/dev/null 2>&1 || restore_status=1
    if (( restore_status == 0 )); then
      wait_for_health "$HEALTHCHECK_URL" || restore_status=1
    fi
  elif [[ "$LEGACY_WAS_ACTIVE" == true && "$LEGACY_STOPPED" == true ]]; then
    systemctl start "$LEGACY_SERVICE_NAME" >/dev/null 2>&1 || restore_status=1
  fi

  return "$restore_status"
}

cleanup() {
  local exit_code=$?
  local restore_status=0
  local current_release
  local count=0
  local candidate

  trap - EXIT HUP INT TERM
  set +e

  if (( exit_code != 0 )); then
    if restore_previous; then
      rm -rf "$RELEASE_DIR"
      printf '%s\n' 'Docker 远程部署未完成，旧版本已恢复。' >&2
    else
      printf 'Docker 远程部署恢复不完整；请检查 %s、%s 和 Compose 项目 %s。\n' \
        "$RELEASE_DIR" "$PREVIOUS_RELEASE_DIR" "$PROJECT_NAME" >&2
      restore_status=1
    fi
  else
    current_release="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"
    while IFS= read -r candidate; do
      [[ -n "$candidate" ]] || continue
      candidate="${candidate%/}"
      [[ "$candidate" == "$current_release" ]] && continue
      count=$((count + 1))
      if (( count > KEEP_RELEASES )); then
        rm -rf "$candidate"
      fi
    done < <(ls -dt "$RELEASES_DIR"/*/ 2>/dev/null || true)
  fi

  rm -f "$COMPOSE_UPLOAD_PATH"
  rm -rf "$LOCK_DIR"
  if (( restore_status != 0 )); then
    exit_code=1
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

pull_image
docker image inspect "$IMAGE_REF" >/dev/null

echo "准备 Docker release：$RELEASE_ID"
mkdir "$RELEASE_DIR"
cp "$COMPOSE_UPLOAD_PATH" "$RELEASE_COMPOSE_PATH"
printf '%s\n' "$IMAGE_REF" > "$RELEASE_IMAGE_PATH"
chmod 644 "$RELEASE_COMPOSE_PATH" "$RELEASE_IMAGE_PATH"

echo '校验 Compose 配置'
run_compose "$RELEASE_COMPOSE_PATH" "$IMAGE_REF" config --quiet
echo '执行容器内 Prisma 迁移'
run_compose "$RELEASE_COMPOSE_PATH" "$IMAGE_REF" \
  run --rm --no-deps app ./node_modules/.bin/prisma validate --config /app/prisma.config.ts
run_compose "$RELEASE_COMPOSE_PATH" "$IMAGE_REF" \
  run --rm --no-deps app ./node_modules/.bin/prisma migrate deploy --config /app/prisma.config.ts

if [[ -n "$LEGACY_SERVICE_NAME" ]] && command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "$LEGACY_SERVICE_NAME"; then
    LEGACY_WAS_ACTIVE=true
    LEGACY_STOPPED=true
    systemctl stop "$LEGACY_SERVICE_NAME"
  fi
  if systemctl is-enabled --quiet "$LEGACY_SERVICE_NAME"; then
    LEGACY_WAS_ENABLED=true
  fi
fi

echo '启动 Docker 应用容器'
APP_SWITCH_ATTEMPTED=true
run_compose "$RELEASE_COMPOSE_PATH" "$IMAGE_REF" \
  up --detach --no-deps --force-recreate app
verify_active_image

echo "等待健康检查：$HEALTHCHECK_URL"
if ! wait_for_health "$HEALTHCHECK_URL"; then
  die "健康检查失败：$HEALTHCHECK_URL"
fi

CURRENT_TMP="$DOCKER_STATE_DIR/.current.$$"
rm -f "$CURRENT_TMP"
ln -s "$RELEASE_DIR" "$CURRENT_TMP"
mv -f "$CURRENT_TMP" "$CURRENT_LINK"
CURRENT_LINK_UPDATED=true
[[ "$(readlink "$CURRENT_LINK")" == "$RELEASE_DIR" ]] || die '当前 release 指针校验失败'
verify_active_image

if [[ "$LEGACY_WAS_ENABLED" == true ]]; then
  systemctl disable "$LEGACY_SERVICE_NAME"
fi

echo "Docker 远程发布成功：$RELEASE_ID"
