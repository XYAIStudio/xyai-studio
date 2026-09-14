#!/usr/bin/env bash
# Cloud Agent environment bootstrap for XYAI Studio / DeepSeek Harness.
# Idempotent: safe to re-run against a cached or partially prepared tree.
set -euo pipefail

cd "$(dirname "$0")/.."

# The monorepo requires Node ^22.19 || >=24; the default base image ships an
# older Node, so install Node 24 system-wide when it is missing or too old.
need_node=1
if command -v node >/dev/null 2>&1; then
  if [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 ]; then
    need_node=0
  fi
fi
if [ "$need_node" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# pnpm is pinned by package.json "packageManager"; Corepack provides it.
sudo corepack enable

# pnpm re-runs `install` before every `pnpm run <script>` by default. That
# reinstall trips the repo's git-hook postinstall against the Cursor-owned
# core.hooksPath. Disable the pre-run check so plain `pnpm run` / `pnpm dsh`
# work without reinstalling.
pnpm config set --location=user verify-deps-before-run false

# CI=true makes the root postinstall skip lefthook git-hook installation, which
# otherwise refuses to replace the Cursor-managed core.hooksPath and fails.
CI=true pnpm install --frozen-lockfile

# Build the host/client libraries and the web frontend bundle so `dsh web`
# serves immediately and the web tests can run.
CI=true pnpm run build

# xyos-backend is a standalone npm package (not part of the pnpm workspace).
( cd xyos-backend && npm install )
