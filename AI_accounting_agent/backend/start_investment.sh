#!/usr/bin/env bash
# AI 投资助手后端启动脚本

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8020}"
MODEL_DIR_DEFAULT="${SCRIPT_DIR}/../../Qwen3-4B"

cd "$SCRIPT_DIR"

if [[ ! -d .venv ]]; then
  echo "错误：未找到虚拟环境 $SCRIPT_DIR/.venv" >&2
  echo "请先在 backend 目录创建虚拟环境并安装 requirements.txt。" >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  PORT_PIDS="$(lsof -ti:"$PORT" 2>/dev/null || true)"
  if [[ -n "$PORT_PIDS" ]]; then
    echo "停止占用端口 $PORT 的进程：$PORT_PIDS"
    kill $PORT_PIDS
  fi
fi

source .venv/bin/activate
export QWEN_MODEL_DIR="${QWEN_MODEL_DIR:-$MODEL_DIR_DEFAULT}"
export PORT

if [[ ! -d "$QWEN_MODEL_DIR" ]]; then
  echo "错误：模型目录不存在：$QWEN_MODEL_DIR" >&2
  echo "请设置 QWEN_MODEL_DIR 后重试。" >&2
  exit 1
fi

echo "启动 AI 投资助手后端：http://0.0.0.0:$PORT"
echo "模型目录：$QWEN_MODEL_DIR"
exec python investment_app.py
