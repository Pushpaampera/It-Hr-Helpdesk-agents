#!/usr/bin/env bash
# Creates backups/helpdesk-<timestamp>.tar.gz of the whole project, excluding
# node_modules, .venv, backups, and .env. No sudo required.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p backups
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/helpdesk-${TIMESTAMP}.tar.gz"

tar -czf "$OUT" \
  --exclude="./node_modules" \
  --exclude="./frontend/node_modules" \
  --exclude="./backend/.venv" \
  --exclude="./.venv" \
  --exclude="./backups" \
  --exclude="./.env" \
  --exclude="./frontend/dist" \
  --exclude="**/__pycache__" \
  --exclude="./.git" \
  .

echo "Backup written to $OUT"
