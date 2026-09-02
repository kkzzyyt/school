#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
CONFIG_FILE="${DEPLOY_CONFIG_FILE:-$PROJECT_ROOT/deploy.env}"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
  set +a
fi

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-}"
DEPLOY_TARGET="${DEPLOY_TARGET:-}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_IDENTITY_FILE="${DEPLOY_IDENTITY_FILE:-}"
DEPLOY_KNOWN_HOSTS_FILE="${DEPLOY_KNOWN_HOSTS_FILE:-}"
DEPLOY_PROXY_COMMAND="${DEPLOY_PROXY_COMMAND:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/school.19soul.cn}"
DEPLOY_ENV_PATH="${DEPLOY_ENV_PATH:-}"
DEPLOY_APP_NAME="${DEPLOY_APP_NAME:-school}"
DEPLOY_APP_PORT="${DEPLOY_APP_PORT:-3000}"
DEPLOY_RUNTIME="${DEPLOY_RUNTIME:-pm2}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-}"
DEPLOY_APP_PATH="${DEPLOY_APP_PATH:-}"
DEPLOY_PM2_BIN="${DEPLOY_PM2_BIN:-pm2}"
DEPLOY_NPM_BIN="${DEPLOY_NPM_BIN:-npm}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-}"
DEPLOY_KEEP_RELEASES="${DEPLOY_KEEP_RELEASES:-5}"
DEPLOY_BATCH_MODE="${DEPLOY_BATCH_MODE:-false}"
SKIP_CHECKS=false
SKIP_MIGRATIONS=false
DRY_RUN=false

usage() {
  cat <<'EOF'
用法：scripts/deploy.sh [选项]

通过 SSH 发布 Next.js 应用。SSH 私钥可通过 ssh-agent 提供，或使用 --identity 指定。

选项：
  --host <主机>           SSH 主机名或 IP（也可设置 DEPLOY_HOST）
  --user <用户>           SSH 用户名（也可设置 DEPLOY_USER）
  --target <user@host>    直接指定 SSH 目标
  --port <端口>           SSH 端口，默认 22
  --identity <文件>       SSH 私钥文件
  --known-hosts <文件>    固定的 SSH known_hosts 文件（必填）
  --proxy-command <命令>  SSH 代理命令，例如 SOCKS5 的 nc 命令
  --path <目录>           远程应用目录，默认 /www/wwwroot/school.19soul.cn
  --env-path <文件>       远程运行时 .env；默认 PM2 为 <目录>/.env，systemd 为 <目录>/.deploy/runtime.env
  --app-name <名称>       PM2 进程名，默认 school
  --app-port <端口>       Next.js 本地监听端口，默认 3000
  --runtime <模式>        远程运行模式：pm2 或 systemd
  --service <名称>        systemd 服务名（systemd 模式必填）
  --app-path <目录>       systemd 应用目录，默认 <部署目录>/school
  --pm2 <命令或文件>      PM2 命令或绝对路径，默认 pm2
  --npm <命令或文件>      npm 命令或绝对路径，默认 npm
  --health-url <URL>      远程健康检查 URL
  --keep-releases <数量>  保留 release 数量，默认 5
  --batch-mode            禁止密码交互，仅使用密钥认证
  --skip-checks           跳过 lint、类型检查和单元测试
  --skip-migrations       跳过远程 prisma migrate deploy
  --dry-run               只打包并检查 SSH，不上传或发布
  -h, --help              显示帮助

也可以把配置写入项目根目录的 deploy.env（该文件不会提交到 Git）。
EOF
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

validate_integer() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^[0-9]+$ ]] || die "$name 必须是数字：$value"
}

validate_port() {
  local name="$1"
  local value="$2"
  validate_integer "$name" "$value"
  (( value >= 1 && value <= 65535 )) || die "$name 超出范围：$value"
}

validate_no_whitespace() {
  local name="$1"
  local value="$2"
  [[ "$value" != *[[:space:]]* ]] || die "$name 不能包含空格或换行"
}

validate_canonical_remote_path() {
  local name="$1"
  local value="$2"

  [[ "$value" == /* ]] || die "$name 必须是绝对路径"
  [[ "$value" != *[[:space:]]* ]] || die "$name 不能包含空格或换行"
  [[ "$value" != *'//'* ]] || die "$name 不能包含连续 /"
  [[ "$value" != */ ]] || die "$name 不能以 / 结尾"
  [[ "$value" != *"/./"* && "$value" != */. ]] || die "$name 不能包含 . 路径段"
  [[ "$value" != *"/../"* && "$value" != */.. ]] || die "$name 不能包含 .."
}

shell_quote() {
  local value="$1"
  value="${value//\'/\'\\\'\'}"
  printf "'%s'" "$value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      [[ $# -ge 2 ]] || die "--host 缺少参数"
      DEPLOY_HOST="$2"
      shift 2
      ;;
    --user)
      [[ $# -ge 2 ]] || die "--user 缺少参数"
      DEPLOY_USER="$2"
      shift 2
      ;;
    --target)
      [[ $# -ge 2 ]] || die "--target 缺少参数"
      DEPLOY_TARGET="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || die "--port 缺少参数"
      DEPLOY_PORT="$2"
      shift 2
      ;;
    --identity)
      [[ $# -ge 2 ]] || die "--identity 缺少参数"
      DEPLOY_IDENTITY_FILE="$2"
      shift 2
      ;;
    --known-hosts)
      [[ $# -ge 2 ]] || die "--known-hosts 缺少参数"
      DEPLOY_KNOWN_HOSTS_FILE="$2"
      shift 2
      ;;
    --proxy-command)
      [[ $# -ge 2 ]] || die "--proxy-command 缺少参数"
      DEPLOY_PROXY_COMMAND="$2"
      shift 2
      ;;
    --path)
      [[ $# -ge 2 ]] || die "--path 缺少参数"
      DEPLOY_PATH="$2"
      shift 2
      ;;
    --env-path)
      [[ $# -ge 2 ]] || die "--env-path 缺少参数"
      DEPLOY_ENV_PATH="$2"
      shift 2
      ;;
    --app-name)
      [[ $# -ge 2 ]] || die "--app-name 缺少参数"
      DEPLOY_APP_NAME="$2"
      shift 2
      ;;
    --app-port)
      [[ $# -ge 2 ]] || die "--app-port 缺少参数"
      DEPLOY_APP_PORT="$2"
      shift 2
      ;;
    --runtime)
      [[ $# -ge 2 ]] || die "--runtime 缺少参数"
      DEPLOY_RUNTIME="$2"
      shift 2
      ;;
    --service)
      [[ $# -ge 2 ]] || die "--service 缺少参数"
      DEPLOY_SERVICE="$2"
      shift 2
      ;;
    --app-path)
      [[ $# -ge 2 ]] || die "--app-path 缺少参数"
      DEPLOY_APP_PATH="$2"
      shift 2
      ;;
    --pm2)
      [[ $# -ge 2 ]] || die "--pm2 缺少参数"
      DEPLOY_PM2_BIN="$2"
      shift 2
      ;;
    --npm)
      [[ $# -ge 2 ]] || die "--npm 缺少参数"
      DEPLOY_NPM_BIN="$2"
      shift 2
      ;;
    --health-url)
      [[ $# -ge 2 ]] || die "--health-url 缺少参数"
      DEPLOY_HEALTHCHECK_URL="$2"
      shift 2
      ;;
    --keep-releases)
      [[ $# -ge 2 ]] || die "--keep-releases 缺少参数"
      DEPLOY_KEEP_RELEASES="$2"
      shift 2
      ;;
    --batch-mode)
      DEPLOY_BATCH_MODE=true
      shift
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    --skip-migrations)
      SKIP_MIGRATIONS=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知参数：$1。使用 --help 查看用法"
      ;;
  esac
done

if [[ -z "$DEPLOY_ENV_PATH" ]]; then
  if [[ "$DEPLOY_RUNTIME" == systemd ]]; then
    DEPLOY_ENV_PATH="$DEPLOY_PATH/.deploy/runtime.env"
  else
    DEPLOY_ENV_PATH="$DEPLOY_PATH/.env"
  fi
fi
if [[ -z "$DEPLOY_APP_PATH" ]]; then
  DEPLOY_APP_PATH="$DEPLOY_PATH/school"
fi
if [[ -z "$DEPLOY_HEALTHCHECK_URL" ]]; then
  DEPLOY_HEALTHCHECK_URL="http://127.0.0.1:$DEPLOY_APP_PORT/api/health"
fi

if [[ -z "$DEPLOY_TARGET" ]]; then
  [[ -n "$DEPLOY_HOST" ]] || die "请设置 DEPLOY_HOST，或使用 --target user@host"
  [[ -n "$DEPLOY_USER" ]] || die "请设置 DEPLOY_USER，或使用 --target user@host"
  DEPLOY_TARGET="$DEPLOY_USER@$DEPLOY_HOST"
fi

for value_pair in \
  "DEPLOY_TARGET=$DEPLOY_TARGET" \
  "DEPLOY_PATH=$DEPLOY_PATH" \
  "DEPLOY_ENV_PATH=$DEPLOY_ENV_PATH" \
  "DEPLOY_APP_PATH=$DEPLOY_APP_PATH" \
  "DEPLOY_HEALTHCHECK_URL=$DEPLOY_HEALTHCHECK_URL" \
  "DEPLOY_PM2_BIN=$DEPLOY_PM2_BIN" \
  "DEPLOY_NPM_BIN=$DEPLOY_NPM_BIN"; do
  value_name="${value_pair%%=*}"
  value_value="${value_pair#*=}"
  validate_no_whitespace "$value_name" "$value_value"
done

validate_canonical_remote_path "DEPLOY_PATH" "$DEPLOY_PATH"
validate_canonical_remote_path "DEPLOY_ENV_PATH" "$DEPLOY_ENV_PATH"
validate_canonical_remote_path "DEPLOY_APP_PATH" "$DEPLOY_APP_PATH"
[[ "$DEPLOY_RUNTIME" == pm2 || "$DEPLOY_RUNTIME" == systemd ]] || die "DEPLOY_RUNTIME 必须是 pm2 或 systemd"
if [[ "$DEPLOY_RUNTIME" == systemd ]]; then
  [[ "$DEPLOY_APP_PATH" == "$DEPLOY_PATH"/* ]] || die "systemd 应用目录必须位于部署目录内"
  [[ "$DEPLOY_SERVICE" =~ ^[A-Za-z0-9_.@-]+$ ]] || die "DEPLOY_SERVICE 非法"
fi
[[ "$DEPLOY_APP_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || die "DEPLOY_APP_NAME 只能包含字母、数字、下划线和连字符"
[[ "$DEPLOY_PROXY_COMMAND" != *$'\n'* && "$DEPLOY_PROXY_COMMAND" != *$'\r'* ]] || die "DEPLOY_PROXY_COMMAND 不能包含换行"
[[ "$DEPLOY_BATCH_MODE" == true || "$DEPLOY_BATCH_MODE" == false ]] || die "DEPLOY_BATCH_MODE 必须是 true 或 false"
validate_port "DEPLOY_PORT" "$DEPLOY_PORT"
validate_port "DEPLOY_APP_PORT" "$DEPLOY_APP_PORT"
validate_integer "DEPLOY_KEEP_RELEASES" "$DEPLOY_KEEP_RELEASES"
(( DEPLOY_KEEP_RELEASES >= 1 )) || die "DEPLOY_KEEP_RELEASES 至少为 1"

require_command bash
require_command git
require_command mkdir
require_command mktemp
require_command npm
require_command scp
require_command ssh

[[ -f "$PROJECT_ROOT/scripts/package-deploy.sh" ]] || die "找不到 scripts/package-deploy.sh"
if [[ "$DEPLOY_RUNTIME" == systemd ]]; then
  [[ -f "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" ]] || die "找不到 scripts/remote-deploy-systemd.sh"
else
  [[ -f "$PROJECT_ROOT/scripts/remote-deploy.sh" ]] || die "找不到 scripts/remote-deploy.sh"
fi

if [[ -n "$DEPLOY_IDENTITY_FILE" ]]; then
  [[ -f "$DEPLOY_IDENTITY_FILE" ]] || die "SSH 私钥不存在：$DEPLOY_IDENTITY_FILE"
fi
[[ -n "$DEPLOY_KNOWN_HOSTS_FILE" ]] || die "必须通过 DEPLOY_KNOWN_HOSTS_FILE 或 --known-hosts 指定固定的 SSH known_hosts 文件"
[[ -f "$DEPLOY_KNOWN_HOSTS_FILE" ]] || die "known_hosts 文件不存在：$DEPLOY_KNOWN_HOSTS_FILE"

SSH_OPTIONS=(
  -p "$DEPLOY_PORT"
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$DEPLOY_KNOWN_HOSTS_FILE"
  -o GlobalKnownHostsFile=/dev/null
  -o UpdateHostKeys=no
)
SCP_OPTIONS=(
  -P "$DEPLOY_PORT"
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$DEPLOY_KNOWN_HOSTS_FILE"
  -o GlobalKnownHostsFile=/dev/null
  -o UpdateHostKeys=no
)
if [[ "$DEPLOY_BATCH_MODE" == true ]]; then
  SSH_OPTIONS+=(-o BatchMode=yes)
  SCP_OPTIONS+=(-o BatchMode=yes)
fi
if [[ -n "$DEPLOY_PROXY_COMMAND" ]]; then
  SSH_OPTIONS+=(-o "ProxyCommand=$DEPLOY_PROXY_COMMAND")
  SCP_OPTIONS+=(-o "ProxyCommand=$DEPLOY_PROXY_COMMAND")
fi
if [[ -n "$DEPLOY_IDENTITY_FILE" ]]; then
  SSH_OPTIONS+=(-i "$DEPLOY_IDENTITY_FILE")
  SCP_OPTIONS+=(-i "$DEPLOY_IDENTITY_FILE")
fi
run_ssh() {
  ssh "${SSH_OPTIONS[@]}" "$DEPLOY_TARGET" "$@"
}

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/school-deploy.XXXXXX")"
cleanup_local() {
  rm -rf "$TEMP_DIR"
}
trap cleanup_local EXIT

echo "[1/5] 检查 SSH 连接：$DEPLOY_TARGET"
run_ssh "printf '%s\\n' 'SSH connection established'"

echo "[2/5] 生成源码发布包"
PACKAGE_ARGS=(--output-dir "$TEMP_DIR")
if [[ "$SKIP_CHECKS" == true ]]; then
  PACKAGE_ARGS+=(--skip-checks)
fi
"$PROJECT_ROOT/scripts/package-deploy.sh" "${PACKAGE_ARGS[@]}"

archives=("$TEMP_DIR/${PROJECT_NAME}-deploy-"*.tar.gz)
(( ${#archives[@]} == 1 )) || die "未找到唯一的发布包"
ARCHIVE_PATH="${archives[0]}"
[[ -f "$ARCHIVE_PATH" ]] || die "未找到生成的发布包"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
[[ -f "$CHECKSUM_PATH" ]] || die "未找到发布包校验文件"
ARCHIVE_NAME="$(basename "$ARCHIVE_PATH")"
SOURCE_REV="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || printf 'working')"
if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain --untracked-files=all 2>/dev/null || true)" ]]; then
  SOURCE_REV=working
fi
RELEASE_ID="$(date '+%Y%m%d-%H%M%S')-$SOURCE_REV-$$"
REMOTE_INCOMING="$DEPLOY_PATH/.deploy/incoming"
REMOTE_ARCHIVE="$REMOTE_INCOMING/$ARCHIVE_NAME"
REMOTE_CHECKSUM="$REMOTE_ARCHIVE.sha256"

if [[ "$DRY_RUN" == true ]]; then
  echo "[3/5] dry-run：跳过远程目录创建和发布包上传"
  echo "已完成 dry-run：仅检查 SSH、执行本地检查并生成发布包"
  echo "发布包：$ARCHIVE_PATH"
  exit 0
fi

echo "[3/5] 准备远程目录并上传发布包"
run_ssh "mkdir -p $(shell_quote "$REMOTE_INCOMING")"
scp "${SCP_OPTIONS[@]}" "$ARCHIVE_PATH" "$DEPLOY_TARGET:$REMOTE_ARCHIVE"
scp "${SCP_OPTIONS[@]}" "$CHECKSUM_PATH" "$DEPLOY_TARGET:$REMOTE_CHECKSUM"

if [[ "$DEPLOY_RUNTIME" == systemd ]]; then
  echo "[4/5] 在远程 release 中安装、构建、迁移并切换 systemd 服务"
  REMOTE_COMMAND="bash -s -- $(shell_quote "$DEPLOY_PATH") $(shell_quote "$REMOTE_ARCHIVE") $(shell_quote "$REMOTE_CHECKSUM") $(shell_quote "$RELEASE_ID") $(shell_quote "$DEPLOY_ENV_PATH") $(shell_quote "$DEPLOY_SERVICE") $(shell_quote "$DEPLOY_APP_PATH") $(shell_quote "$DEPLOY_HEALTHCHECK_URL") $(shell_quote "$DEPLOY_KEEP_RELEASES") $(shell_quote "$DEPLOY_NPM_BIN") $(shell_quote "$SKIP_MIGRATIONS")"
  run_ssh "$REMOTE_COMMAND" < "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh"
else
  echo "[4/5] 在远程 release 中安装、构建、迁移并切换 PM2 进程"
  REMOTE_COMMAND="bash -s -- $(shell_quote "$DEPLOY_PATH") $(shell_quote "$REMOTE_ARCHIVE") $(shell_quote "$REMOTE_CHECKSUM") $(shell_quote "$RELEASE_ID") $(shell_quote "$DEPLOY_ENV_PATH") $(shell_quote "$DEPLOY_APP_NAME") $(shell_quote "$DEPLOY_APP_PORT") $(shell_quote "$DEPLOY_KEEP_RELEASES") $(shell_quote "$DEPLOY_PM2_BIN") $(shell_quote "$DEPLOY_NPM_BIN") $(shell_quote "$DEPLOY_HEALTHCHECK_URL") $(shell_quote "$SKIP_MIGRATIONS")"
  run_ssh "$REMOTE_COMMAND" < "$PROJECT_ROOT/scripts/remote-deploy.sh"
fi

echo "[5/5] 部署完成"
echo "远程目录：$DEPLOY_PATH"
echo "运行模式：$DEPLOY_RUNTIME"
if [[ "$DEPLOY_RUNTIME" == pm2 ]]; then
  echo "PM2 进程：$DEPLOY_APP_NAME"
else
  echo "systemd 服务：$DEPLOY_SERVICE"
fi
echo "健康检查：$DEPLOY_HEALTHCHECK_URL"
