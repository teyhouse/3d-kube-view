#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

MODE="${1:-prod}"
export NAMESPACES="${NAMESPACES:-}"
export PORT="${PORT:-8080}"

if [ "$MODE" = "demo" ]; then
  export DEMO=1
  MODE=prod
fi

if [ "${DEMO:-}" != "1" ]; then
  command -v kubectl >/dev/null || { echo "kubectl not found in PATH" >&2; exit 1; }
  CTX_ARGS=()
  [ -n "${KUBE_CONTEXT:-}" ] && CTX_ARGS=(--context "$KUBE_CONTEXT")
  kubectl ${CTX_ARGS[@]+"${CTX_ARGS[@]}"} get --raw /readyz >/dev/null 2>&1 || { echo "cluster not reachable with current kubectl context, try ./start.sh demo" >&2; exit 1; }
fi

[ -d node_modules ] || npm install

[ "${DEMO:-}" = "1" ] && echo "Demo mode: simulated cluster, kubectl is not used" || echo "Namespaces: ${NAMESPACES:-all}"
case "$MODE" in
  dev)
    exec npx vite
    ;;
  prod)
    npm run build
    exec node server/index.js
    ;;
  *)
    echo "usage: ./start.sh [dev|prod|demo]" >&2
    exit 1
    ;;
esac
