#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORKFLOW="$PROJECT_ROOT/.github/workflows/ci-cd.yml"

fail() {
  printf 'CI/CD 配置测试失败：%s\n' "$*" >&2
  exit 1
}

[[ -f "$WORKFLOW" ]] || fail '缺少 .github/workflows/ci-cd.yml'

for required_text in \
  'pull_request:' \
  'push:' \
  'branches: [main]' \
  'concurrency:' \
  'cancel-in-progress: true' \
  'npm ci --no-audit --no-fund' \
  'npm run lint' \
  'npm run typecheck' \
  'npm run test:coverage' \
  'npm run build' \
  'npm run test:standalone:runtime' \
  'npm run package:standalone' \
  'actions/upload-artifact@v4' \
  'actions/download-artifact@v4' \
  'SCHOOL_DEPLOY_SSH_KEY' \
  'SCHOOL_DEPLOY_KNOWN_HOSTS' \
  'scripts/remote-deploy-standalone.sh'; do
  grep -Fq -- "$required_text" "$WORKFLOW" || fail "workflow 缺少：$required_text"
done

grep -Fq "github.event_name == 'push'" "$WORKFLOW" || fail '生产部署未限制在 push 事件'
grep -Fq "github.ref == 'refs/heads/main'" "$WORKFLOW" || fail '生产部署未限制在 main 分支'
grep -Fq 'scp_opts=(' "$WORKFLOW" || fail 'scp 未使用独立的参数数组'
grep -Fq -- '-P "$DEPLOY_PORT"' "$WORKFLOW" || fail 'scp 未使用大写 -P 指定端口'
grep -Fq 'scp "${scp_opts[@]}"' "$WORKFLOW" || fail '上传命令未使用 scp 参数数组'
if grep -Fq 'scp "${ssh_opts[@]}"' "$WORKFLOW"; then
  fail 'scp 错误复用了 ssh 参数数组'
fi
if grep -Fq 'sleep 600' "$WORKFLOW"; then
  fail '生产部署仍包含 10 分钟延迟'
fi

build_step_line="$(grep -n -m 1 'name: Build standalone artifact' "$WORKFLOW" | cut -d: -f1)"
smoke_step_line="$(grep -n -m 1 'name: Smoke test standalone runtime' "$WORKFLOW" | cut -d: -f1)"
package_step_line="$(grep -n -m 1 'name: Package standalone artifact' "$WORKFLOW" | cut -d: -f1)"
(( build_step_line < smoke_step_line && smoke_step_line < package_step_line )) || {
  fail 'standalone 运行时冒烟测试必须位于构建后、打包前'
}

printf '%s\n' 'CI/CD 配置测试通过'
