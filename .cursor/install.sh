#!/usr/bin/env bash
# Cloud Agent bootstrap for the XYAI Studio 0.5 line (release/0.5).
# Node ^22 and pnpm 9.15.0 (packageManager). No Electron GUI, dsh web, or xyos-backend.
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:${PATH:-}"

need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
else
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [ "${major}" -lt 22 ]; then
    need_node=1
  fi
fi

if [ "${need_node}" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  export PATH="/usr/bin:/usr/local/bin:${PATH:-}"
fi

corepack enable
corepack prepare pnpm@9.15.0 --activate

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "${root}"

# CI=true keeps pnpm non-interactive if a package postinstall checks CI.
export CI=true
pnpm install --frozen-lockfile
