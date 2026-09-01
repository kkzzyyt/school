#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
OUTPUT_DIR="$PROJECT_ROOT/releases"
SKIP_CHECKS=false

usage() {
  cat <<'EOF'
用法：scripts/package-deploy.sh [选项]

选项：
  --output-dir <目录>  指定发布包输出目录，默认是项目下的 releases/
  --skip-checks        跳过 lint、类型检查和单元测试
  -h, --help           显示帮助

示例：
  npm run package:deploy
  npm run package:deploy -- --skip-checks
  npm run package:deploy -- --output-dir /tmp/school-release
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      [[ $# -ge 2 ]] || { echo "--output-dir 缺少目录参数" >&2; exit 2; }
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for required_command in tar gzip npm; do
  command -v "$required_command" >/dev/null 2>&1 || {
    echo "缺少命令：$required_command" >&2
    exit 1
  }
done

[[ -f "$PROJECT_ROOT/package.json" ]] || {
  echo "找不到项目 package.json：$PROJECT_ROOT/package.json" >&2
  exit 1
}

PROJECT_NAME="$(basename "$PROJECT_ROOT")"
[[ "$PROJECT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "项目目录名只能包含字母、数字、点、下划线和连字符：$PROJECT_NAME" >&2
  exit 1
}

if [[ "$SKIP_CHECKS" == false ]]; then
  echo "[1/4] 运行 ESLint"
  (cd "$PROJECT_ROOT" && npm run lint)

  echo "[2/4] 运行 TypeScript 检查"
  (cd "$PROJECT_ROOT" && npm run typecheck)

  echo "[3/4] 运行单元测试"
  (cd "$PROJECT_ROOT" && npm test)
else
  echo "[1/4] 已跳过代码检查"
  echo "[2/4] 已跳过类型检查"
  echo "[3/4] 已跳过单元测试"
fi

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"

if [[ "$OUTPUT_DIR" == "$PROJECT_ROOT" ]]; then
  echo "输出目录不能是项目根目录，请使用 releases/ 或项目外目录" >&2
  exit 2
fi

for reserved_output_dir in "$PROJECT_ROOT/src" "$PROJECT_ROOT/public" "$PROJECT_ROOT/prisma"; do
  if [[ "$OUTPUT_DIR" == "$reserved_output_dir" ]]; then
    echo "输出目录不能直接使用部署源码目录：$reserved_output_dir" >&2
    exit 2
  fi
done

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
ARCHIVE_NAME="${PROJECT_NAME}-deploy-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"

tar_excludes=(
  '--exclude=*/.env*'
  '--exclude=*/.npmrc'
  '--exclude=*/.yarnrc*'
  '--exclude=*/.pnpmrc'
  '--exclude=*.pem'
  '--exclude=*.key'
  '--exclude=*.p12'
  '--exclude=*.pfx'
  '--exclude=*.jks'
  '--exclude=*/id_rsa'
  '--exclude=*/id_ed25519'
  '--exclude=*credentials*.json'
  '--exclude=*service-account*.json'
  '--exclude=*serviceAccount*.json'
  '--exclude=*secret*.json'
  '--exclude=*/src/generated/prisma'
  '--exclude=*.log'
  '--exclude=*.tsbuildinfo'
  '--exclude=.DS_Store'
  '--exclude=._*'
)
if [[ "$OUTPUT_DIR" == "$PROJECT_ROOT"/* ]]; then
  relative_output_dir="${OUTPUT_DIR#"$PROJECT_ROOT"/}"
  tar_excludes+=("--exclude=${PROJECT_NAME}/${relative_output_dir}")
fi

package_entries=(
  "$PROJECT_NAME/package.json"
  "$PROJECT_NAME/package-lock.json"
  "$PROJECT_NAME/next.config.ts"
  "$PROJECT_NAME/tsconfig.json"
  "$PROJECT_NAME/prisma.config.ts"
  "$PROJECT_NAME/src"
  "$PROJECT_NAME/public"
  "$PROJECT_NAME/prisma"
)

echo "[4/4] 生成发布包"
LC_ALL=C COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE_PATH" \
  "${tar_excludes[@]}" \
  -C "$(dirname "$PROJECT_ROOT")" \
  "${package_entries[@]}"

ARCHIVE_CONTENTS="$(LC_ALL=C tar -tzf "$ARCHIVE_PATH")"
for secret_pattern in \
  '(^|/)\.env[^/]*$' \
  '(^|/)\.(npmrc|yarnrc|yarnrc\.yml|pnpmrc)$' \
  '\.(pem|key|p12|pfx|jks)$' \
  '(^|/)(id_rsa|id_ed25519)$' \
  '(credentials|service-account|serviceaccount|secret)[^/]*\.json$' \
  '(^|/)\._[^/]*$'; do
  if grep -Eiq "$secret_pattern" <<<"$ARCHIVE_CONTENTS"; then
    rm -f "$ARCHIVE_PATH"
    echo "发布包安全检查失败，发现疑似秘密文件：$secret_pattern" >&2
    exit 1
  fi
done

set +o pipefail
if gzip -dc "$ARCHIVE_PATH" | grep -aEiq 'LIBARCHIVE\.xattr|SCHILY\.xattr|com\.apple\.'; then
  set -o pipefail
  rm -f "$ARCHIVE_PATH"
  echo "发布包安全检查失败，归档包含 macOS 扩展属性" >&2
  exit 1
fi
set -o pipefail

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && shasum -a 256 "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256")
else
  rm -f "$ARCHIVE_PATH"
  echo "缺少 sha256sum 或 shasum，无法生成校验文件" >&2
  exit 1
fi

ARCHIVE_SIZE="$(du -h "$ARCHIVE_PATH" | awk '{print $1}')"

echo
echo "打包完成"
echo "发布包：$ARCHIVE_PATH"
echo "校验文件：$CHECKSUM_PATH"
echo "大小：$ARCHIVE_SIZE"
echo
echo "可直接运行 npm run deploy 发布；手工上传到服务器时，请先校验 SHA-256，再解压并执行 npm ci 和 npm run build。"
