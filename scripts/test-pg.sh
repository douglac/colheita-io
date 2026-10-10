#!/usr/bin/env bash
# npm run test:pg — a suíte do vitest contra o Postgres 16 do Docker, num banco só de teste (colheita_test),
# recriado do zero a cada rodada (os testes apagam tabelas; o banco de dev "colheita" fica intacto).
set -euo pipefail
PORT="${PG_PORT:-5433}"
docker compose exec -T db psql -U colheita -d colheita -qc 'drop database if exists colheita_test with (force)' -c 'create database colheita_test'
DATABASE_URL="postgres://colheita:colheita@localhost:${PORT}/colheita_test" npx vitest run --no-file-parallelism "$@"
