#!/usr/bin/env bash
# Mirror of .github/workflows/ci.yml + pages.yml build steps.
# Run before pushing to predict CI/CD success.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

step 'rustup target add wasm32-unknown-unknown'
rustup target add wasm32-unknown-unknown >/dev/null

step 'cargo test'
cargo test

step 'npm ci (web)'
(cd web && npm ci)

step 'npm run build:wasm'
(cd web && npm run build:wasm)

step 'npm test (web)'
(cd web && npm test)

step 'npm run build (web)'
(cd web && npm run build)

step 'serve dist on :8765 for 5s sanity check'
(cd web/dist && python3 -m http.server 8765 >/dev/null 2>&1) &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 1
if curl -sf -o /dev/null http://localhost:8765/index.html; then
  echo 'index.html served OK'
else
  echo 'index.html did NOT serve'; exit 1
fi
kill $SERVER_PID 2>/dev/null || true
trap - EXIT

printf '\n\033[1;32m✓ all CI steps passed locally\033[0m\n'
