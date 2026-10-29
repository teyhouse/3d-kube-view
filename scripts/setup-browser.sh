#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BROWSER_DIR="$ROOT/.browser"
LIB_DIR="$BROWSER_DIR/libs"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSER_DIR/ms-playwright"

cd "$ROOT"
npx playwright install chromium-headless-shell

SHELL_BIN="$(find "$PLAYWRIGHT_BROWSERS_PATH" -type f -name chrome-headless-shell | head -n1)"
MISSING="$(LD_LIBRARY_PATH="$LIB_DIR/usr/lib/x86_64-linux-gnu" ldd "$SHELL_BIN" | awk '/not found/ {print $1}')"

if [ -n "$MISSING" ]; then
  echo "Fetching missing libraries into $LIB_DIR: $MISSING"
  TMP="$(mktemp -d)"
  (cd "$TMP" && apt-get download libnspr4 libnss3 libasound2t64)
  mkdir -p "$LIB_DIR"
  for deb in "$TMP"/*.deb; do dpkg-deb -x "$deb" "$LIB_DIR"; done
  rm -rf "$TMP"
fi

echo "Headless browser ready in $BROWSER_DIR"
