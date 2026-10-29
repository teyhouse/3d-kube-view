#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

MODE="${1:-prod}"
export NAMESPACES="${NAMESPACES:-}"
export PORT="${PORT:-8080}"

command -v kubectl >/dev/null || { echo "kubectl not found in PATH" >&2; exit 1; }
CTX_ARGS=()
[ -n "${KUBE_CONTEXT:-}" ] && CTX_ARGS=(--context "$KUBE_CONTEXT")
kubectl "${CTX_ARGS[@]}" get --raw /readyz >/dev/null 2>&1 || { echo "cluster not reachable with current kubectl context" >&2; exit 1; }

[ -d node_modules ] || npm install

echo "Namespaces: ${NAMESPACES:-all}"
case "$MODE" in
  dev)
    exec npx vite
    ;;
  prod)
    npm run build
    exec node server/index.js
    ;;
  *)
    echo "usage: ./start.sh [dev|prod]" >&2
    exit 1
    ;;
esac
