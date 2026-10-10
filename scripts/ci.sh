#!/usr/bin/env bash
# CI local (npm run ci): lint → tipos → testes (PGlite e Postgres 16) → build → imagem Docker → e2e.
# Precisa do Docker rodando. Etapas puláveis: SKIP_DOCKER=1 (sem Postgres/e2e), SKIP_E2E=1.
# Portas do Docker trocáveis (PG_PORT, MAILPIT_SMTP_PORT, MAILPIT_UI_PORT, APP_PORT), ver docker-compose.yml.
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
export PG_PORT="${PG_PORT:-5433}" APP_PORT="${APP_PORT:-3200}" MAILPIT_UI_PORT="${MAILPIT_UI_PORT:-8025}"
export APP_VERSION="${APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo local)}"
DB="postgres://colheita:colheita@localhost:${PG_PORT}/colheita"

step "lint";   npm run -s lint
step "tipos";  npm run -s typecheck
step "testes (PGlite)"; npx vitest run

if [ "${SKIP_DOCKER:-}" != "1" ]; then
  step "Postgres 16 + Mailpit"; docker compose up -d --wait db mailpit
  step "testes (Postgres 16)";  scripts/test-pg.sh
fi

step "build";  npm run -s build
rm -rf .next/standalone # o build do Docker faz o dele; aqui só confere que compila (disco)

if [ "${SKIP_DOCKER:-}" != "1" ] && [ "${SKIP_E2E:-}" != "1" ]; then
  step "imagem + app prod-local"; docker compose --profile prod-local up -d --build --wait
  step "e2e (desktop + celular)"
  E2E_BASE_URL="http://localhost:${APP_PORT}" DATABASE_URL="$DB" MAILPIT_URL="http://localhost:${MAILPIT_UI_PORT}" npx playwright test
fi
step "CI ok"
