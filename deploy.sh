#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

previous_commit=""
on_error() {
  exit_code=$?
  echo "La actualización falló (código $exit_code). Revisa: docker compose logs --tail=200" >&2
  if [[ -n "$previous_commit" ]]; then
    echo "El commit anterior era: $previous_commit" >&2
  fi
  exit "$exit_code"
}
trap on_error ERR

if [[ ! -f .env ]]; then
  echo "Error: falta .env. Cópialo desde .env.example y completa los secretos." >&2
  exit 1
fi

for command_name in git docker curl gzip; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: no se encontró el comando requerido: $command_name" >&2
    exit 1
  fi
done

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Error: hay cambios locales en archivos versionados. Guárdalos antes de actualizar." >&2
  exit 1
fi

mkdir -p .deploy backups
previous_commit="$(git rev-parse HEAD)"
printf '%s\n' "$previous_commit" > .deploy/previous_commit
git symbolic-ref --quiet --short HEAD > .deploy/branch || true

if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  backup_file="backups/torito-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  echo "Creando respaldo de PostgreSQL en $backup_file..."
  docker compose exec -T db sh -ec 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$backup_file"
fi

echo "Descargando cambios (solo avance lineal)..."
git pull --ff-only

echo "Construyendo imágenes..."
docker compose build --pull

echo "Aplicando migraciones y levantando servicios..."
docker compose up -d --remove-orphans

echo "Esperando que la aplicación responda..."
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
  http://127.0.0.1:4070/api/health >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
  http://127.0.0.1:3070/ >/dev/null

docker compose ps
echo "Actualización completada. Commit anterior: $previous_commit"
echo "El respaldo previo, si la base estaba activa, está en backups/."
