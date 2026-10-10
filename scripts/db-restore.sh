#!/usr/bin/env bash
# Restaura um backup feito por db-backup.sh. APAGA o conteúdo atual do banco de destino.
#   npm run db:restore -- backups/colheita-20261009-080000.dump
#   DATABASE_URL=postgres://… npm run db:restore -- arquivo.dump   (pede confirmação; CONFIRM=1 pula)
# Depois de restaurar, o app aplica sozinho as migrações mais novas que o backup não tinha.
set -euo pipefail
FILE="${1:?uso: db-restore.sh <arquivo.dump>}"
[ -f "$FILE" ] || { echo "arquivo não encontrado: $FILE" >&2; exit 1; }
URL="${DATABASE_URL:-postgres://colheita:colheita@localhost:${PG_PORT:-5433}/colheita}"
if [ "${CONFIRM:-}" != "1" ]; then
  read -r -p "Restaurar $FILE em ${URL%%\?*} (apaga os dados atuais)? Digite SIM: " ok
  [ "$ok" = "SIM" ] || { echo "cancelado"; exit 1; }
fi
DOCKER_URL="${URL//@localhost:/@host.docker.internal:}"
DOCKER_URL="${DOCKER_URL//@127.0.0.1:/@host.docker.internal:}"
docker run --rm -i --add-host=host.docker.internal:host-gateway postgres:16-alpine \
  pg_restore --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error --dbname="$DOCKER_URL" < "$FILE"
echo "restaurado: $FILE"
