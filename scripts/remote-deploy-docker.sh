#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 11 ]]; then
  printf 'remote-deploy-docker.sh 参数数量错误：期望 11，实际 %s\n' "$#" >&2
  exit 2
fi

DEPLOY_PATH="$1"
IMAGE_ARCHIVE_PATH="$2"
CHECKSUM_PATH="$3"
COMPOSE_UPLOAD_PATH="$4"
RELEASE_ID="$5"
ENV_PATH="$6"
PROJECT_NAME="$7"
HEALTHCHECK_URL="$8"
KEEP_RELEASES="$9"
IMAGE_REF="${10}"
LEGACY_SERVICE_NAME="${11}"

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
validate_path "镜像发布包路径" "$IMAGE_ARCHIVE_PATH"
validate_path "镜像校验文件路径" "$CHECKSUM_PATH"
validate_path "Compose 文件路径" "$COMPOSE_UPLOAD_PATH"
validate_path ".env 路径" "$ENV_PATH"
[[ "$DEPLOY_PATH" != / ]] || die "部署目录不能使用文件系统根目录"
[[ "$ENV_PATH" == "$DEPLOY_PATH"/* ]] || die ".env 必须位于部署目录内"
validate_integer "保留 release 数量" "$KEEP_RELEASES"
(( KEEP_RELEASES >= 1 )) || die "保留 release 数量至少为 1"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || die "release id 非法"
[[ "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]+$ ]] || die "Compose 项目名非法"
[[ "$IMAGE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/@:-]*$ ]] || die "镜像引用非法"
[[ "$HEALTHCHECK_URL" != "" && "$HEALTHCHECK_URL" != *[[:space:]]* ]] || die "健康检查 URL 非法"
if [[ -n "$LEGACY_SERVICE_NAME" ]]; then
  [[ "$LEGACY_SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ && "$LEGACY_SERVICE_NAME" != -* ]] || die "旧 systemd 服务名非法"
fi

case "$IMAGE_ARCHIVE_PATH" in
  "$DEPLOY_PATH/.deploy/incoming/"*) ;;
  *) die "镜像发布包路径不在受控 incoming 目录中" ;;
esac
case "$CHECKSUM_PATH" in
  "$DEPLOY_PATH/.deploy/incoming/"*) ;;
  *) die "镜像校验文件路径不在受控 incoming 目录中" ;;
esac
case "$COMPOSE_UPLOAD_PATH" in
  "$DEPLOY_PATH/.deploy/incoming/"*) ;;
  *) die "Compose 文件路径不在受控 incoming 目录中" ;;
esac

IMAGE_ARCHIVE_NAME="$(basename "$IMAGE_ARCHIVE_PATH")"
CHECKSUM_NAME="$(basename "$CHECKSUM_PATH")"
COMPOSE_NAME="$(basename "$COMPOSE_UPLOAD_PATH")"
[[ "$IMAGE_ARCHIVE_NAME" =~ ^[A-Za-z0-9._-]+\.tar\.gz$ ]] || die "镜像发布包文件名非法"
[[ "$CHECKSUM_NAME" == "$IMAGE_ARCHIVE_NAME.sha256" ]] || die "校验文件名与镜像发布包不匹配"
[[ "$COMPOSE_NAME" == docker-compose.production.yml || "$COMPOSE_NAME" =~ ^docker-compose[.]production-[A-Za-z0-9._-]+[.]yml$ ]] || die "Compose 文件名非法"
[[ -f "$IMAGE_ARCHIVE_PATH" ]] || die "镜像发布包不存在：$IMAGE_ARCHIVE_PATH"
[[ -f "$CHECKSUM_PATH" ]] || die "镜像校验文件不存在：$CHECKSUM_PATH"
[[ -f "$COMPOSE_UPLOAD_PATH" ]] || die "Compose 文件不存在：$COMPOSE_UPLOAD_PATH"
[[ -f "$ENV_PATH" ]] || die "运行时 .env 不存在：$ENV_PATH"
[[ -d "$DEPLOY_PATH" ]] || die "部署目录不存在：$DEPLOY_PATH"

for command_name in bash cp curl docker ln ls mkdir mv rm readlink sed sha256sum sleep; do
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

  rm -f "$IMAGE_ARCHIVE_PATH" "$CHECKSUM_PATH" "$COMPOSE_UPLOAD_PATH"
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

echo '校验 Docker 镜像发布包'
(cd "$(dirname "$IMAGE_ARCHIVE_PATH")" && sha256sum -c "$CHECKSUM_NAME")
docker load --input "$IMAGE_ARCHIVE_PATH" >/dev/null
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

echo "等待健康检查：$HEALTHCHECK_URL"
if ! wait_for_health "$HEALTHCHECK_URL"; then
  die "健康检查失败：$HEALTHCHECK_URL"
fi

CURRENT_TMP="$DOCKER_STATE_DIR/.current.$$"
rm -f "$CURRENT_TMP"
ln -s "$RELEASE_DIR" "$CURRENT_TMP"
mv -f "$CURRENT_TMP" "$CURRENT_LINK"
CURRENT_LINK_UPDATED=true

if [[ "$LEGACY_WAS_ENABLED" == true ]]; then
  systemctl disable "$LEGACY_SERVICE_NAME"
fi

echo "Docker 远程发布成功：$RELEASE_ID"
