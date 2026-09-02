#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 10 ]]; then
  printf 'remote-deploy-standalone.sh 参数数量错误：期望 10，实际 %s\n' "$#" >&2
  exit 2
fi

DEPLOY_PATH="$1"
ARCHIVE_PATH="$2"
CHECKSUM_PATH="$3"
RELEASE_ID="$4"
ENV_PATH="$5"
SERVICE_NAME="$6"
APP_PATH="$7"
HEALTHCHECK_URL="$8"
KEEP_ROLLBACKS="$9"
PRISMA_BIN="${10}"

die() {
  printf 'standalone 远程部署失败：%s\n' "$*" >&2
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
  [[ "$value" != *'//'* ]] || die "$name 不能包含连续 /"
  [[ "$value" != */ ]] || die "$name 不能以 / 结尾"
  [[ "$value" != *'/../'* && "$value" != */.. ]] || die "$name 不能包含 .."
}

validate_integer() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^[0-9]+$ ]] || die "$name 必须是数字"
}

validate_path "部署目录" "$DEPLOY_PATH"
validate_path "发布包路径" "$ARCHIVE_PATH"
validate_path "校验文件路径" "$CHECKSUM_PATH"
validate_path ".env 路径" "$ENV_PATH"
validate_path "应用目录" "$APP_PATH"
validate_path "Prisma CLI 路径" "$PRISMA_BIN"
[[ "$HEALTHCHECK_URL" != *[[:space:]]* ]] || die "健康检查 URL 不能包含空格或换行"
[[ "$DEPLOY_PATH" != / ]] || die "部署目录不能使用文件系统根目录"
[[ "$APP_PATH" == "$DEPLOY_PATH"/* ]] || die "应用目录必须位于部署目录内"
[[ "$APP_PATH" != "$DEPLOY_PATH/.deploy" && "$APP_PATH" != "$DEPLOY_PATH/.deploy"/* ]] || die "应用目录不能位于 .deploy 内"
[[ "$ENV_PATH" == "$DEPLOY_PATH"/* ]] || die ".env 必须位于部署目录内"
[[ "$ENV_PATH" != "$APP_PATH" && "$ENV_PATH" != "$APP_PATH"/* ]] || die ".env 必须位于应用目录之外"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || die "release id 非法"
[[ "$SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ && "$SERVICE_NAME" != -* ]] || die "systemd 服务名非法"
validate_integer "保留回滚数量" "$KEEP_ROLLBACKS"
(( KEEP_ROLLBACKS >= 1 )) || die "保留回滚数量至少为 1"
[[ -x "$PRISMA_BIN" ]] || die "Prisma CLI 不可执行：$PRISMA_BIN"

case "$ARCHIVE_PATH" in
  "$DEPLOY_PATH/.deploy/incoming/"*) ;;
  *) die "发布包路径不在受控 incoming 目录中" ;;
esac
case "$CHECKSUM_PATH" in
  "$DEPLOY_PATH/.deploy/incoming/"*) ;;
  *) die "校验文件路径不在受控 incoming 目录中" ;;
esac

ARCHIVE_NAME="$(basename "$ARCHIVE_PATH")"
CHECKSUM_NAME="$(basename "$CHECKSUM_PATH")"
[[ "$ARCHIVE_NAME" =~ ^[A-Za-z0-9._-]+\.tar\.gz$ ]] || die "发布包文件名非法"
[[ "$CHECKSUM_NAME" == "$ARCHIVE_NAME.sha256" ]] || die "校验文件名与发布包不匹配"
[[ -f "$ARCHIVE_PATH" ]] || die "发布包不存在：$ARCHIVE_PATH"
[[ -f "$CHECKSUM_PATH" ]] || die "校验文件不存在：$CHECKSUM_PATH"
[[ -f "$ENV_PATH" ]] || die "运行时 .env 不存在：$ENV_PATH"
[[ -d "$DEPLOY_PATH" ]] || die "部署目录不存在：$DEPLOY_PATH"

for command_name in bash chmod chown curl find gzip id ln mkdir mv rm printf rmdir sha256sum sleep sort systemctl tar; do
  require_command "$command_name"
done

DEPLOY_STATE_DIR="$DEPLOY_PATH/.deploy"
RELEASES_DIR="$DEPLOY_STATE_DIR/releases"
LOCK_DIR="$DEPLOY_STATE_DIR/lock"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
ROLLBACK_DIR="$DEPLOY_STATE_DIR/rollback-$RELEASE_ID"
FAILED_DIR="$DEPLOY_STATE_DIR/failed-$RELEASE_ID"
SERVICE_WAS_ACTIVE=false
STOPPED=false
SWITCHED=false
OLD_APP_MOVED=false

[[ ! -e "$RELEASE_DIR" ]] || die "release 已存在：$RELEASE_DIR"
[[ ! -e "$ROLLBACK_DIR" ]] || die "回滚目录已存在：$ROLLBACK_DIR"
[[ ! -e "$FAILED_DIR" ]] || die "失败目录已存在：$FAILED_DIR"
[[ ! -e "$LOCK_DIR" ]] || die "已有部署正在进行，或存在遗留锁：$LOCK_DIR"

SERVICE_USER="$(systemctl show "$SERVICE_NAME" -p User --value)"
SERVICE_GROUP="$(systemctl show "$SERVICE_NAME" -p Group --value)"
SERVICE_WORKING_DIRECTORY="$(systemctl show "$SERVICE_NAME" -p WorkingDirectory --value)"
SERVICE_EXEC_START="$(systemctl show "$SERVICE_NAME" -p ExecStart --value)"
[[ -n "$SERVICE_USER" ]] || SERVICE_USER=root
[[ -n "$SERVICE_GROUP" ]] || SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
[[ "$SERVICE_WORKING_DIRECTORY" == "$APP_PATH" ]] || die "systemd WorkingDirectory 必须为 $APP_PATH，当前为 $SERVICE_WORKING_DIRECTORY"
id "$SERVICE_USER" >/dev/null 2>&1 || die "systemd 用户不存在：$SERVICE_USER"

SERVICE_NEEDS_CONFIG=false
if [[ "$SERVICE_EXEC_START" != *'.next/standalone/server.js'* ]]; then
  SERVICE_NEEDS_CONFIG=true
fi
SERVICE_OVERRIDE_PATH="${DEPLOY_STANDALONE_SERVICE_OVERRIDE_PATH:-/etc/systemd/system/${SERVICE_NAME}.d/standalone.conf}"
validate_path "systemd standalone drop-in" "$SERVICE_OVERRIDE_PATH"
SERVICE_OVERRIDE_DIR="${SERVICE_OVERRIDE_PATH%/*}"
SERVICE_CONFIG_CHANGED=false
SERVICE_OVERRIDE_DIR_CREATED=false

mkdir -p "$RELEASES_DIR"
mkdir "$LOCK_DIR"
printf '%s\n' "$$" > "$LOCK_DIR/pid"

restore_previous_release() {
  set +e
  local restore_status=0
  if [[ "$STOPPED" == true || "$SWITCHED" == true ]]; then
    systemctl stop "$SERVICE_NAME" || restore_status=1
  fi
  if [[ "$SWITCHED" == true && -e "$APP_PATH" && ! -e "$FAILED_DIR" ]]; then
    mv "$APP_PATH" "$FAILED_DIR" || restore_status=1
  fi
  if [[ "$OLD_APP_MOVED" == true && -e "$ROLLBACK_DIR" && ! -e "$APP_PATH" ]]; then
    mv "$ROLLBACK_DIR" "$APP_PATH" || restore_status=1
  fi
  [[ "$restore_status" -eq 0 ]] || return 1
  rm -rf "$FAILED_DIR"
  return 0
}

cleanup() {
  local exit_code=$?
  trap - EXIT HUP INT TERM
  set +e
  if (( exit_code != 0 )); then
    if [[ "$SERVICE_CONFIG_CHANGED" == true ]]; then
      systemctl stop "$SERVICE_NAME" || true
    fi
    if restore_previous_release; then
      if [[ "$SERVICE_CONFIG_CHANGED" == true ]]; then
        rm -f "$SERVICE_OVERRIDE_PATH"
        systemctl daemon-reload || true
        if [[ "$SERVICE_OVERRIDE_DIR_CREATED" == true ]]; then
          rmdir "$SERVICE_OVERRIDE_DIR" 2>/dev/null || true
        fi
        SERVICE_CONFIG_CHANGED=false
      fi
      if [[ "$SERVICE_WAS_ACTIVE" == true && -d "$APP_PATH" ]]; then
        systemctl start "$SERVICE_NAME" || true
      fi
      rm -rf "$RELEASE_DIR"
      printf '%s\n' 'standalone 远程部署未完成，旧版本已恢复。' >&2
    else
      printf 'standalone 远程部署恢复不完整；请检查 %s、%s、%s 和服务 %s。\n' "$FAILED_DIR" "$ROLLBACK_DIR" "$RELEASE_DIR" "$SERVICE_NAME" >&2
    fi
  else
    rm -rf "$FAILED_DIR"
    local count=0
    local candidate
    while IFS= read -r candidate; do
      [[ -n "$candidate" ]] || continue
      count=$((count + 1))
      if (( count > KEEP_ROLLBACKS )); then
        rm -rf "$candidate"
      fi
    done < <(find "$DEPLOY_STATE_DIR" -mindepth 1 -maxdepth 1 -type d -name 'rollback-*' -print | sort -r)
  fi
  rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"
  rm -rf "$LOCK_DIR"
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

echo '校验 standalone 发布包'
cd "$(dirname "$ARCHIVE_PATH")"
sha256sum -c "$CHECKSUM_NAME"

echo "准备 release：$RELEASE_ID"
mkdir "$RELEASE_DIR"
LC_ALL=C tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR" --strip-components=1
[[ -f "$RELEASE_DIR/package.json" ]] || die '发布包解压后缺少 package.json'
[[ -f "$RELEASE_DIR/.next/standalone/server.js" ]] || die '发布包解压后缺少 .next/standalone/server.js'
[[ -d "$RELEASE_DIR/.next/static" ]] || die '发布包解压后缺少 .next/static'
[[ -d "$RELEASE_DIR/public" ]] || die '发布包解压后缺少 public'
[[ -d "$RELEASE_DIR/prisma/migrations" ]] || die '发布包解压后缺少 Prisma migrations'
[[ ! -e "$RELEASE_DIR/.env" && ! -L "$RELEASE_DIR/.env" ]] || die '发布包不应包含 .env'
[[ ! -e "$RELEASE_DIR/node_modules" && ! -L "$RELEASE_DIR/node_modules" ]] || die '发布包根目录不应包含 node_modules'
ln -s "$ENV_PATH" "$RELEASE_DIR/.env"
chown -R -h "$SERVICE_USER:$SERVICE_GROUP" "$RELEASE_DIR"

echo '执行 Prisma 生产迁移'
set -a
# shellcheck disable=SC1090
. "$ENV_PATH"
set +a
: "${DATABASE_URL:?运行时 .env 缺少 DATABASE_URL}"
(cd "$RELEASE_DIR" && "$PRISMA_BIN" migrate deploy)

if [[ "$SERVICE_NEEDS_CONFIG" == true ]]; then
  [[ ! -e "$SERVICE_OVERRIDE_PATH" ]] || die "已有 standalone systemd drop-in，拒绝覆盖：$SERVICE_OVERRIDE_PATH"
  if [[ ! -d "$SERVICE_OVERRIDE_DIR" ]]; then
    mkdir -p "$SERVICE_OVERRIDE_DIR"
    SERVICE_OVERRIDE_DIR_CREATED=true
  fi
  printf '%s\n' \
    '[Service]' \
    'ExecStart=' \
    "ExecStart=/usr/local/bin/node $APP_PATH/.next/standalone/server.js" \
    "EnvironmentFile=$ENV_PATH" \
    'Environment=HOSTNAME=127.0.0.1' \
    'Environment=PORT=3000' \
    > "$SERVICE_OVERRIDE_PATH"
  chmod 644 "$SERVICE_OVERRIDE_PATH"
  SERVICE_CONFIG_CHANGED=true
  systemctl daemon-reload
  echo '已将 systemd 服务切换为 standalone server.js'
fi

if systemctl is-active --quiet "$SERVICE_NAME"; then
  SERVICE_WAS_ACTIVE=true
fi
echo '停止 systemd 服务并切换 release'
STOPPED=true
systemctl stop "$SERVICE_NAME"
if [[ -d "$APP_PATH" ]]; then
  OLD_APP_MOVED=true
  mv "$APP_PATH" "$ROLLBACK_DIR"
fi
SWITCHED=true
mv "$RELEASE_DIR" "$APP_PATH"

echo '启动 systemd 服务'
systemctl start "$SERVICE_NAME"
echo "等待健康检查：$HEALTHCHECK_URL"
healthy=false
for attempt in $(seq 1 30); do
  http_status="$(curl -fsS --max-time 3 --output /dev/null --write-out '%{http_code}' -- "$HEALTHCHECK_URL" 2>/dev/null || true)"
  if [[ "$http_status" == 200 ]]; then
    healthy=true
    break
  fi
  sleep 1
done
[[ "$healthy" == true ]] || die "健康检查失败：$HEALTHCHECK_URL"

echo "standalone 远程发布成功：$RELEASE_ID"
