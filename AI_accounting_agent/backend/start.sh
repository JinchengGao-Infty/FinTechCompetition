#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "$0")"
ROOT_DIR="$(cd ../.. && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$ROOT_DIR/.venv/bin/python}"
if [ ! -x "$PYTHON_BIN" ]; then PYTHON_BIN=python3; fi
export QWEN_MODEL_DIR="${BOOKKEEPER_MODEL_DIR:-${QWEN_MODEL_DIR:-}}"
exec "$PYTHON_BIN" -m uvicorn app:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8010}"
