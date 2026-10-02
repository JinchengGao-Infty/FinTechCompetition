#!/usr/bin/env bash
# 始终以本目录（frontend）为静态站点根目录启动，避免 URL 与工作目录不匹配。

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-5500}"
BIND="${BIND:-0.0.0.0}"

echo "静态前端根目录：$SCRIPT_DIR"
echo "访问地址：http://$BIND:$PORT/investment/welcome/code.html"
exec python3 -m http.server "$PORT" --bind "$BIND" --directory "$SCRIPT_DIR"
