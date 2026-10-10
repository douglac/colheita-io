#!/bin/sh
# Entrada da imagem: o volume do PGlite (Fly: /data) monta como root. Se o contêiner sobe como root,
# acerta o dono do diretório do banco e baixa o privilégio para o usuário `node` antes de rodar o app.
# Rodando já como `node` (docker run --user node), só executa o comando.
set -e
# Restauração: se existir "$PGLITE_DIR.restore" (dump extraído lá), ele vira o banco antes
# de o node abrir o PGlite, e o banco de antes fica em "$PGLITE_DIR.antes-AAAAMMDD-HHMMSS" (apagar à mão depois).
if [ -n "$PGLITE_DIR" ] && [ -f "$PGLITE_DIR.restore/PG_VERSION" ]; then
  OLD="$PGLITE_DIR.antes-$(date -u +%Y%m%d-%H%M%S)"
  [ -e "$PGLITE_DIR" ] && mv "$PGLITE_DIR" "$OLD"
  mv "$PGLITE_DIR.restore" "$PGLITE_DIR"
  echo "cf-entrypoint: banco restaurado de $PGLITE_DIR.restore (o anterior ficou em $OLD)"
fi
if [ "$(id -u)" = "0" ]; then
  if [ -n "$PGLITE_DIR" ]; then
    mkdir -p "$PGLITE_DIR"
    chown node:node "$(dirname "$PGLITE_DIR")" "$PGLITE_DIR"
    chown -R node:node "$PGLITE_DIR"
  fi
  exec su-exec node "$@"
fi
exec "$@"
