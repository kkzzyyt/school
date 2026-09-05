#!/usr/bin/env bash
set -u

LOCAL_PORT="${TUNNEL_LOCAL_PORT:-3308}"
REMOTE_HOST="${TUNNEL_REMOTE_HOST:-39.106.46.229}"
REMOTE_USER="${TUNNEL_REMOTE_USER:-root}"
REMOTE_PORT="${TUNNEL_REMOTE_PORT:-3306}"

echo "启动远程数据库安全隧道: 127.0.0.1:${LOCAL_PORT} -> ${REMOTE_HOST}:${REMOTE_PORT}..."

while true; do
  ssh -N \
    -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=10 \
    -o ServerAliveCountMax=6 \
    -o TCPKeepAlive=yes \
    "${REMOTE_USER}@${REMOTE_HOST}" 2>&1 || true
  sleep 2
done
