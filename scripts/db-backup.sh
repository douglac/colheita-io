#!/usr/bin/env bash
# Backup do Postgres (formato custom do pg_dump: comprimido, restaura tabela a tabela).
#   npm run db:backup                    → backups/colheita-AAAAMMDD-HHMMSS.dump (banco do docker-compose)
#   DATABASE_URL=postgres://… npm run db:backup   → qualquer Postgres (produção: rode de uma máquina com acesso)
#   KEEP=14 → mantém só os 14 backups mais novos na pasta.
# Usa o pg_dump do contêiner postgres:16 (não precisa instalar nada na máquina).
set -euo pipefail
URL="${DATABASE_URL:-postgres://colheita:colheita@localhost:${PG_PORT:-5433}/colheita}"
DIR="${BACKUP_DIR:-backups}"
KEEP="${KEEP:-14}"
mkdir -p "$DIR"
FILE="$DIR/colheita-$(date -u +%Y%m%d-%H%M%S).dump"
# Dentro do contêiner, "localhost" é o próprio contêiner: troca pelo host da máquina.
DOCKER_URL="${URL//@localhost:/@host.docker.internal:}"
DOCKER_URL="${DOCKER_URL//@127.0.0.1:/@host.docker.internal:}"
docker run --rm --add-host=host.docker.internal:host-gateway postgres:16-alpine \
  pg_dump --format=custom --no-owner --no-acl --dbname="$DOCKER_URL" > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
echo "backup: $FILE ($(du -h "$FILE" | cut -f1))"
# Rotação simples.
ls -1t "$DIR"/colheita-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
