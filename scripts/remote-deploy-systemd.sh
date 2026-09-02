#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 11 ]]; then
  printf 'remote-deploy-systemd.sh 参数数量错误：期望 11，实际 %s\n' "$#" >&2
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
KEEP_RELEASES="$9"
NPM_BIN="${10}"
SKIP_MIGRATIONS="${11}"

die() {
  printf 'systemd 远程部署失败：%s\n' "$*" >&2
  exit 1
}

warn() {
  printf 'systemd 远程部署警告：%s\n' "$*" >&2
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

validate_path() {
  local name="$1"
  local value="$2"

  [[ "$value" == /* ]] || die "$name 必须是绝对路径"
  [[ "$value" != *[[:space:]]* ]] || die "$name 不能包含空格或换行"
  [[ "$value" != *'//'* ]] || die "$name 不能包含连续 /"
  [[ "$value" != */ ]] || die "$name 不能以 / 结尾"
  [[ "$value" != *"/./"* && "$value" != */. ]] || die "$name 不能包含 . 路径段"
  [[ "$value" != *"/../"* && "$value" != */.. ]] || die "$name 不能包含 .."
}

canonicalize_existing_path() {
  local path="$1"
  local depth="${2:-0}"
  local parent
  local base
  local link_target

  (( depth < 40 )) || return 1
  if [[ -d "$path" ]]; then
    (cd -P "$path" && pwd -P)
    return
  fi
  [[ -e "$path" || -L "$path" ]] || return 1

  parent="${path%/*}"
  base="${path##*/}"
  [[ -n "$parent" ]] || parent="/"
  parent="$(cd -P "$parent" && pwd -P)" || return 1

  if [[ -L "$parent/$base" ]]; then
    link_target="$(readlink "$parent/$base")" || return 1
    if [[ "$link_target" == /* ]]; then
      canonicalize_existing_path "$link_target" "$((depth + 1))"
    elif [[ "$parent" == / ]]; then
      canonicalize_existing_path "/$link_target" "$((depth + 1))"
    else
      canonicalize_existing_path "$parent/$link_target" "$((depth + 1))"
    fi
  elif [[ "$parent" == / ]]; then
    printf '/%s\n' "$base"
  else
    printf '%s/%s\n' "$parent" "$base"
  fi
}

canonicalize_path_allow_missing() {
  local path="$1"
  local probe="$1"
  local suffix=""
  local parent
  local base
  local resolved

  while [[ ! -e "$probe" && ! -L "$probe" ]]; do
    [[ "$probe" != / ]] || return 1
    base="${probe##*/}"
    parent="${probe%/*}"
    [[ -n "$parent" ]] || parent="/"
    suffix="/$base$suffix"
    probe="$parent"
  done

  resolved="$(canonicalize_existing_path "$probe")" || return 1
  if [[ "$resolved" == / ]]; then
    printf '%s\n' "$suffix"
  else
    printf '%s%s\n' "$resolved" "$suffix"
  fi
}

validate_integer() {
  local name="$1"
  local value="$2"

  [[ "$value" =~ ^[0-9]+$ ]] || die "$name 必须是数字：$value"
}

validate_path "部署目录" "$DEPLOY_PATH"
validate_path "发布包路径" "$ARCHIVE_PATH"
validate_path "校验文件路径" "$CHECKSUM_PATH"
validate_path ".env 路径" "$ENV_PATH"
validate_path "应用目录" "$APP_PATH"
[[ "$HEALTHCHECK_URL" != *[[:space:]]* ]] || die "健康检查 URL 不能包含空格或换行"
[[ "$DEPLOY_PATH" != / ]] || die "部署目录不能使用文件系统根目录"
[[ "$APP_PATH" != "$DEPLOY_PATH" ]] || die "应用目录不能与部署目录相同"
case "$APP_PATH" in
  "$DEPLOY_PATH"/*) ;;
  *) die "应用目录必须位于部署目录内" ;;
esac
case "$APP_PATH" in
  "$DEPLOY_PATH/.deploy"|"$DEPLOY_PATH/.deploy"/*) die "应用目录不能位于 .deploy 状态目录内" ;;
esac
case "$ENV_PATH" in
  "$APP_PATH"|"$APP_PATH"/*) die "systemd 运行时 .env 必须位于应用目录之外" ;;
esac
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || die "release id 非法"
[[ "$SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ && "$SERVICE_NAME" != -* ]] || die "systemd 服务名非法"
validate_integer "保留 release 数量" "$KEEP_RELEASES"
(( KEEP_RELEASES >= 1 )) || die "保留 release 数量至少为 1"
[[ "$SKIP_MIGRATIONS" == true || "$SKIP_MIGRATIONS" == false ]] || die "迁移开关非法"

[[ -f "$ARCHIVE_PATH" ]] || die "发布包不存在：$ARCHIVE_PATH"
[[ -f "$CHECKSUM_PATH" ]] || die "校验文件不存在：$CHECKSUM_PATH"
[[ -f "$ENV_PATH" ]] || die "远程运行时 .env 不存在：$ENV_PATH"
require_command readlink
DEPLOY_PATH="$(canonicalize_existing_path "$DEPLOY_PATH")" || die "无法解析部署目录的物理路径：$DEPLOY_PATH"
APP_PATH="$(canonicalize_path_allow_missing "$APP_PATH")" || die "无法解析应用目录的物理路径：$APP_PATH"
ENV_PATH="$(canonicalize_existing_path "$ENV_PATH")" || die "无法解析运行时 .env 的物理路径：$ENV_PATH"
ARCHIVE_PATH="$(canonicalize_existing_path "$ARCHIVE_PATH")" || die "无法解析发布包的物理路径：$ARCHIVE_PATH"
CHECKSUM_PATH="$(canonicalize_existing_path "$CHECKSUM_PATH")" || die "无法解析校验文件的物理路径：$CHECKSUM_PATH"

[[ -d "$DEPLOY_PATH" ]] || die "部署目录不是目录：$DEPLOY_PATH"
case "$APP_PATH" in
  "$DEPLOY_PATH"/*) ;;
  *) die "应用目录的物理路径必须位于部署目录内：$APP_PATH" ;;
esac
case "$APP_PATH" in
  "$DEPLOY_PATH/.deploy"|"$DEPLOY_PATH/.deploy"/*) die "应用目录不能位于 .deploy 状态目录内" ;;
esac
case "$ENV_PATH" in
  "$APP_PATH"|"$APP_PATH"/*) die "systemd 运行时 .env 必须位于应用目录之外" ;;
esac
case "$ENV_PATH" in
  "$DEPLOY_PATH"/*) ;;
  *) die "systemd 运行时 .env 的物理路径必须位于部署目录内：$ENV_PATH" ;;
esac

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

for command_name in bash find gzip ln mkdir mv readlink rm sleep sort systemctl tar chown id; do
  require_command "$command_name"
done
validate_command "npm" "$NPM_BIN"

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
INCOMING_DIR="$DEPLOY_STATE_DIR/incoming"
LOCK_DIR="$DEPLOY_STATE_DIR/lock"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
ROLLBACK_DIR="$DEPLOY_STATE_DIR/rollback-$RELEASE_ID"
FAILED_DIR="$DEPLOY_STATE_DIR/failed-$RELEASE_ID"
SERVICE_WAS_ACTIVE=false
STOPPED=false
OLD_APP_MOVED=false
SWITCHED=false

if [[ -e "$APP_PATH" && ! -d "$APP_PATH" ]]; then
  die "应用目录存在但不是目录：$APP_PATH"
fi
[[ ! -e "$RELEASE_DIR" ]] || die "release 已存在：$RELEASE_DIR"
[[ ! -e "$ROLLBACK_DIR" ]] || die "回滚目录已存在：$ROLLBACK_DIR"
[[ ! -e "$FAILED_DIR" ]] || die "失败目录已存在：$FAILED_DIR"
[[ ! -e "$LOCK_DIR" ]] || die "已有部署正在进行，或存在遗留锁：$LOCK_DIR"

mkdir -p "$INCOMING_DIR" "$RELEASES_DIR"
mkdir "$LOCK_DIR"
printf '%s\n' "$$" > "$LOCK_DIR/pid"

restore_previous_release() {
  set +e

  if [[ "$STOPPED" == true || "$SWITCHED" == true ]]; then
    if ! systemctl stop "$SERVICE_NAME"; then
      printf 'systemd 恢复失败：无法停止当前服务 %s；未移动应用目录。\n' "$SERVICE_NAME" >&2
      return 1
    fi
  fi

  if [[ "$SWITCHED" == true && -e "$APP_PATH" && ! -e "$FAILED_DIR" ]]; then
    if ! mv "$APP_PATH" "$FAILED_DIR"; then
      printf 'systemd 恢复失败：无法将新应用从 %s 移至 %s。\n' "$APP_PATH" "$FAILED_DIR" >&2
      return 1
    fi
  fi
  if [[ "$OLD_APP_MOVED" == true && -e "$ROLLBACK_DIR" && ! -e "$APP_PATH" ]]; then
    if ! mv "$ROLLBACK_DIR" "$APP_PATH"; then
      printf 'systemd 恢复失败：无法将回滚目录从 %s 移回 %s。\n' "$ROLLBACK_DIR" "$APP_PATH" >&2
      return 1
    fi
  fi

  if [[ "$SERVICE_WAS_ACTIVE" == true ]]; then
    if [[ ! -d "$APP_PATH" ]]; then
      printf 'systemd 恢复失败：旧应用目录不可用，无法启动服务 %s。\n' "$SERVICE_NAME" >&2
      return 1
    fi
    if ! systemctl start "$SERVICE_NAME"; then
      printf 'systemd 恢复失败：无法启动已恢复的服务 %s。\n' "$SERVICE_NAME" >&2
      return 1
    fi
  fi

  if [[ -e "$FAILED_DIR" ]]; then
    rm -rf "$FAILED_DIR" || warn "已恢复旧服务，但无法清理失败目录：$FAILED_DIR"
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

  printf 'systemd 远程发布收到 %s 信号，正在尝试恢复旧版本。\n' "$signal" >&2
  exit "$status"
}

prune_old_rollbacks() {
  local count=0
  local candidate

  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    count=$((count + 1))
    if (( count > KEEP_RELEASES )); then
      rm -rf "$candidate"
    fi
  done < <(find "$DEPLOY_STATE_DIR" -mindepth 1 -maxdepth 1 -type d -name 'rollback-*' -print | sort -r)
}

cleanup() {
  local status=$?
  trap - EXIT HUP INT TERM
  set +e

  if (( status != 0 )); then
    recovery_complete=true
    if [[ "$STOPPED" == true || "$OLD_APP_MOVED" == true || "$SWITCHED" == true ]]; then
      if ! restore_previous_release; then
        recovery_complete=false
      fi
    fi
    if [[ "$recovery_complete" == true ]]; then
      rm -rf "$RELEASE_DIR"
      printf 'systemd 远程发布未完成，已恢复旧版本。\n' >&2
    else
      printf 'systemd 远程发布恢复不完整；已保留 %s、%s 和 %s 供人工检查。请修复上述失败后恢复旧应用并启动 %s。\n' \
        "$FAILED_DIR" "$ROLLBACK_DIR" "$RELEASE_DIR" "$SERVICE_NAME" >&2
    fi
    rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"
  else
    rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"
    rm -rf "$FAILED_DIR"
    prune_old_rollbacks || warn "旧回滚目录清理失败，可稍后手动清理 $DEPLOY_STATE_DIR"
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
mkdir "$RELEASE_DIR"
LC_ALL=C tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR" --strip-components=1
[[ -f "$RELEASE_DIR/package.json" ]] || die "发布包解压后缺少 package.json"
[[ ! -e "$RELEASE_DIR/.env" && ! -L "$RELEASE_DIR/.env" ]] || die "发布包不应包含 .env"
[[ ! -e "$RELEASE_DIR/.next" && ! -L "$RELEASE_DIR/.next" ]] || die "发布包不应包含本机构建产物 .next"
[[ ! -e "$RELEASE_DIR/node_modules" && ! -L "$RELEASE_DIR/node_modules" ]] || die "发布包不应包含 node_modules"
ln -s "$ENV_PATH" "$RELEASE_DIR/.env"

if ! SERVICE_USER="$(systemctl show "$SERVICE_NAME" -p User --value)"; then
  die "无法读取 systemd 服务用户：$SERVICE_NAME"
fi
if ! SERVICE_GROUP="$(systemctl show "$SERVICE_NAME" -p Group --value)"; then
  die "无法读取 systemd 服务组：$SERVICE_NAME"
fi
if ! SERVICE_WORKING_DIRECTORY="$(systemctl show "$SERVICE_NAME" -p WorkingDirectory --value)"; then
  die "无法读取 systemd 服务工作目录：$SERVICE_NAME"
fi
[[ -n "$SERVICE_WORKING_DIRECTORY" ]] || die "systemd 服务未设置 WorkingDirectory：$SERVICE_NAME"
validate_path "systemd 服务 WorkingDirectory" "$SERVICE_WORKING_DIRECTORY"
SERVICE_WORKING_DIRECTORY="$(canonicalize_path_allow_missing "$SERVICE_WORKING_DIRECTORY")" || die "无法解析 systemd 服务工作目录的物理路径：$SERVICE_WORKING_DIRECTORY"
SERVICE_USER="${SERVICE_USER:-root}"
if [[ -z "$SERVICE_GROUP" ]]; then
  SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
fi
id "$SERVICE_USER" >/dev/null 2>&1 || die "systemd 用户不存在：$SERVICE_USER"
if [[ "$SERVICE_WORKING_DIRECTORY" != "$APP_PATH" ]]; then
  SERVICE_WORKING_DIRECTORY="${SERVICE_WORKING_DIRECTORY:-<unset>}"
  die "systemd 服务 WorkingDirectory 必须为 ${APP_PATH}，当前为 ${SERVICE_WORKING_DIRECTORY}"
fi

echo "在新 release 中安装依赖"
(cd "$RELEASE_DIR" && "$NPM_BIN" ci --include=dev --no-audit --no-fund)

echo "在新 release 中构建 Next.js"
(cd "$RELEASE_DIR" && "$NPM_BIN" run build)

if [[ "$SKIP_MIGRATIONS" == false ]]; then
  echo "执行 Prisma 生产迁移"
  (cd "$RELEASE_DIR" && "$NPM_BIN" run db:deploy)
else
  echo "已跳过 Prisma 生产迁移"
fi

echo "移除开发依赖"
(cd "$RELEASE_DIR" && "$NPM_BIN" prune --omit=dev)

echo "设置 systemd 服务文件权限"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$RELEASE_DIR"

if systemctl is-active --quiet "$SERVICE_NAME"; then
  SERVICE_WAS_ACTIVE=true
fi

echo "停止 systemd 服务并切换应用目录"
STOPPED=true
systemctl stop "$SERVICE_NAME"

if [[ -d "$APP_PATH" ]]; then
  OLD_APP_MOVED=true
  mv "$APP_PATH" "$ROLLBACK_DIR"
fi
SWITCHED=true
mv "$RELEASE_DIR" "$APP_PATH"

echo "启动 systemd 服务"
systemctl start "$SERVICE_NAME"

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

echo "systemd 远程发布成功：$RELEASE_ID"
