#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 12 ]]; then
  printf 'remote-deploy.sh 参数数量错误：期望 12，实际 %s\n' "$#" >&2
  exit 2
fi

DEPLOY_PATH="$1"
ARCHIVE_PATH="$2"
CHECKSUM_PATH="$3"
RELEASE_ID="$4"
ENV_PATH="$5"
APP_NAME="$6"
APP_PORT="$7"
KEEP_RELEASES="$8"
PM2_BIN="$9"
NPM_BIN="${10}"
HEALTHCHECK_URL="${11}"
SKIP_MIGRATIONS="${12}"

die() {
  printf '远程部署失败：%s\n' "$*" >&2
  exit 1
}

warn() {
  printf '远程部署警告：%s\n' "$*" >&2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

validate_command() {
  local name="$1"
  local command_name="$2"
  [[ "$command_name" != *[[:space:]]* ]] || die "$name 不能包含空格"
  if [[ "$command_name" == */* ]]; then
    [[ "$command_name" == /* ]] || die "$name 路径必须是绝对路径：$command_name"
    [[ -x "$command_name" ]] || die "$name 不可执行：$command_name"
  else
    require_command "$command_name"
  fi
}

validate_integer() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^[0-9]+$ ]] || die "$name 必须是数字：$value"
}

validate_no_whitespace() {
  local name="$1"
  local value="$2"
  [[ "$value" != *[[:space:]]* ]] || die "$name 不能包含空格或换行"
}

validate_port() {
  local name="$1"
  local value="$2"
  validate_integer "$name" "$value"
  (( value >= 1 && value <= 65535 )) || die "$name 超出范围：$value"
}

validate_no_whitespace "部署目录" "$DEPLOY_PATH"
validate_no_whitespace "发布包路径" "$ARCHIVE_PATH"
validate_no_whitespace "校验文件路径" "$CHECKSUM_PATH"
validate_no_whitespace "release id" "$RELEASE_ID"
validate_no_whitespace ".env 路径" "$ENV_PATH"
validate_no_whitespace "健康检查 URL" "$HEALTHCHECK_URL"
[[ "$DEPLOY_PATH" == /* ]] || die "部署目录必须是绝对路径"
[[ "$ENV_PATH" == /* ]] || die ".env 路径必须是绝对路径"
[[ "$DEPLOY_PATH" != *"/../"* && "$DEPLOY_PATH" != */.. ]] || die "部署目录不能包含 .."
[[ "$ENV_PATH" != *"/../"* && "$ENV_PATH" != */.. ]] || die ".env 路径不能包含 .."
[[ "$ARCHIVE_PATH" != *"/../"* && "$ARCHIVE_PATH" != */.. ]] || die "发布包路径不能包含 .."
[[ "$CHECKSUM_PATH" != *"/../"* && "$CHECKSUM_PATH" != */.. ]] || die "校验文件路径不能包含 .."
[[ "$DEPLOY_PATH" != / ]] || die "部署目录不能使用文件系统根目录"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || die "release id 非法"
[[ "$APP_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || die "PM2 进程名非法"
validate_port "应用端口" "$APP_PORT"
validate_integer "保留 release 数量" "$KEEP_RELEASES"
(( KEEP_RELEASES >= 1 )) || die "保留 release 数量至少为 1"
[[ "$SKIP_MIGRATIONS" == true || "$SKIP_MIGRATIONS" == false ]] || die "迁移开关非法"

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

require_command bash
require_command find
require_command gzip
require_command ln
require_command mkdir
require_command readlink
require_command rm
require_command sleep
require_command sort
require_command tar
validate_command "npm" "$NPM_BIN"
validate_command "PM2" "$PM2_BIN"

if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM_COMMAND=sha256sum
elif command -v shasum >/dev/null 2>&1; then
  CHECKSUM_COMMAND=shasum
else
  die "缺少 sha256sum 或 shasum"
fi

if command -v curl >/dev/null 2>&1; then
  HEALTHCHECK_COMMAND=curl
elif command -v wget >/dev/null 2>&1; then
  HEALTHCHECK_COMMAND=wget
else
  die "缺少 curl 或 wget，无法执行健康检查"
fi

DEPLOY_STATE_DIR="$DEPLOY_PATH/.deploy"
RELEASES_DIR="$DEPLOY_STATE_DIR/releases"
CURRENT_LINK="$DEPLOY_PATH/current"
INCOMING_DIR="$DEPLOY_STATE_DIR/incoming"
LOCK_DIR="$DEPLOY_STATE_DIR/lock"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
OLD_TARGET=""
APP_WAS_RUNNING=false
SWITCHED=false

if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  die "$CURRENT_LINK 已存在且不是符号链接，为避免覆盖现有目录已停止"
fi
if [[ -L "$CURRENT_LINK" ]]; then
  OLD_TARGET="$(readlink "$CURRENT_LINK")"
fi
[[ -f "$ENV_PATH" ]] || die "远程运行时 .env 不存在：$ENV_PATH"

mkdir -p "$INCOMING_DIR" "$RELEASES_DIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  die "已有部署正在进行，或存在遗留锁：$LOCK_DIR"
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"

restore_previous_release() {
  if [[ "$SWITCHED" != true ]]; then
    return 0
  fi

  if [[ -n "$OLD_TARGET" ]]; then
    if ! ln -sfn "$OLD_TARGET" "$CURRENT_LINK"; then
      printf 'PM2 恢复失败：无法将 current 从 %s 切回 %s。\n' "$CURRENT_LINK" "$OLD_TARGET" >&2
      return 1
    fi
  else
    if ! rm -f "$CURRENT_LINK"; then
      printf 'PM2 恢复失败：无法移除首次发布的 current 链接 %s。\n' "$CURRENT_LINK" >&2
      return 1
    fi
  fi

  "$PM2_BIN" delete "$APP_NAME" >/dev/null 2>&1 || true
  if [[ "$APP_WAS_RUNNING" == true && -e "$CURRENT_LINK" ]]; then
    if ! "$PM2_BIN" start "$NPM_BIN" \
      --name "$APP_NAME" \
      --cwd "$CURRENT_LINK" \
      -- start -- --hostname 127.0.0.1 --port "$APP_PORT"; then
      printf 'PM2 恢复失败：无法启动旧 PM2 进程 %s。\n' "$APP_NAME" >&2
      return 1
    fi
    "$PM2_BIN" save >/dev/null 2>&1 || warn "已恢复旧 PM2 进程，但无法保存 PM2 状态"
  fi
}

handle_signal() {
  local signal="$1"
  local status

  case "$signal" in
    HUP) status=129 ;;
    INT) status=130 ;;
    TERM) status=143 ;;
    *) status=1 ;;
  esac

  printf '远程发布收到 %s 信号，正在尝试恢复旧 release。\n' "$signal" >&2
  exit "$status"
}

prune_old_releases() {
  local count=0
  local candidate
  local candidate_name

  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    candidate_name="$(basename "$candidate")"
    [[ "$candidate_name" == "$RELEASE_ID" ]] && continue
    count=$((count + 1))
    if (( count >= KEEP_RELEASES )); then
      rm -rf "$candidate"
    fi
  done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -print | sort -r)
}

cleanup() {
  local status=$?
  trap - EXIT HUP INT TERM
  set +e

  if (( status != 0 )); then
    recovery_complete=true
    if ! restore_previous_release; then
      recovery_complete=false
    fi
    if [[ "$recovery_complete" == true && -n "$RELEASE_DIR" && -d "$RELEASE_DIR" ]]; then
      rm -rf "$RELEASE_DIR"
    fi
    rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"
    if [[ "$recovery_complete" == true ]]; then
      printf '远程发布未完成，已恢复旧 release。\n' >&2
    else
      printf '远程发布恢复不完整；已保留 %s 供人工检查。请检查 current 链接和 PM2 进程 %s 后恢复旧 release。\n' \
        "$RELEASE_DIR" "$APP_NAME" >&2
    fi
  else
    rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"
    prune_old_releases || warn "旧 release 清理失败，可稍后手动清理 $RELEASES_DIR"
  fi

  rm -rf "$LOCK_DIR"
  exit "$status"
}
trap cleanup EXIT
trap 'handle_signal HUP' HUP
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM

echo "校验发布包"
cd "$(dirname "$ARCHIVE_PATH")"
if [[ "$CHECKSUM_COMMAND" == sha256sum ]]; then
  sha256sum -c "$CHECKSUM_NAME"
else
  shasum -a 256 -c "$CHECKSUM_NAME"
fi

echo "准备 release：$RELEASE_ID"
[[ ! -e "$RELEASE_DIR" ]] || die "release 已存在：$RELEASE_DIR"
mkdir "$RELEASE_DIR"
LC_ALL=C tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR" --strip-components=1
[[ -f "$RELEASE_DIR/package.json" ]] || die "发布包解压后缺少 package.json"
[[ ! -e "$RELEASE_DIR/.env" && ! -L "$RELEASE_DIR/.env" ]] || die "发布包不应包含 .env"
[[ ! -e "$RELEASE_DIR/.next" && ! -L "$RELEASE_DIR/.next" ]] || die "发布包不应包含本机构建产物 .next"
[[ ! -e "$RELEASE_DIR/node_modules" && ! -L "$RELEASE_DIR/node_modules" ]] || die "发布包不应包含 node_modules"
ln -s "$ENV_PATH" "$RELEASE_DIR/.env"

echo "安装依赖"
(cd "$RELEASE_DIR" && "$NPM_BIN" ci --include=dev --no-audit --no-fund)

echo "构建 Next.js"
(cd "$RELEASE_DIR" && "$NPM_BIN" run build)

if [[ "$SKIP_MIGRATIONS" == false ]]; then
  echo "执行 Prisma 生产迁移"
  (cd "$RELEASE_DIR" && "$NPM_BIN" run db:deploy)
else
  echo "已跳过 Prisma 生产迁移"
fi

echo "移除开发依赖"
(cd "$RELEASE_DIR" && "$NPM_BIN" prune --omit=dev)

if "$PM2_BIN" describe "$APP_NAME" >/dev/null 2>&1; then
  APP_WAS_RUNNING=true
  APP_PID="$("$PM2_BIN" pid "$APP_NAME" 2>/dev/null || true)"
  if [[ "$APP_PID" =~ ^0+$ ]]; then
    APP_WAS_RUNNING=false
  fi
fi

echo "切换 current 符号链接"
SWITCHED=true
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

echo "启动 PM2 进程"
"$PM2_BIN" delete "$APP_NAME" >/dev/null 2>&1 || true
"$PM2_BIN" start "$NPM_BIN" \
  --name "$APP_NAME" \
  --cwd "$CURRENT_LINK" \
  -- start -- --hostname 127.0.0.1 --port "$APP_PORT"
"$PM2_BIN" save

echo "等待健康检查：$HEALTHCHECK_URL"
attempt=1
healthy=false
while (( attempt <= 30 )); do
  if [[ "$HEALTHCHECK_COMMAND" == curl ]]; then
    http_status="$(curl -fsS --max-time 3 --output /dev/null --write-out '%{http_code}' -- "$HEALTHCHECK_URL" 2>/dev/null || true)"
    if [[ "$http_status" == 200 ]]; then
      healthy=true
      break
    fi
  else
    wget_output="$(wget -q --server-response --max-redirect=0 -O /dev/null --timeout=3 -- "$HEALTHCHECK_URL" 2>&1 || true)"
    http_status=""
    while IFS= read -r header_line; do
      if [[ "$header_line" =~ HTTP/[0-9.]+[[:space:]]+([0-9]{3}) ]]; then
        http_status="${BASH_REMATCH[1]}"
      fi
    done <<< "$wget_output"
    if [[ "$http_status" == 200 ]]; then
      healthy=true
      break
    fi
  fi
  sleep 1
  attempt=$((attempt + 1))
done
[[ "$healthy" == true ]] || die "健康检查失败：$HEALTHCHECK_URL"

echo "远程发布成功：$RELEASE_ID"
