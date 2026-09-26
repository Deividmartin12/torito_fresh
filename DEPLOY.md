# Despliegue de Torito en una VM Ubuntu de Google Cloud

La instalación queda con esta ruta: Internet → Nginx (80/443) → web Torito (3070) o API
(4070) → PostgreSQL. Los puertos 3070 y 4070 se enlazan únicamente a `127.0.0.1` de la VM y
PostgreSQL no publica ningún puerto.

## 1. Preparar Google Cloud y DNS

Reserva una IP externa estática para la VM. En el proveedor DNS crea dos registros `A` hacia
esa IP:

- `toritofresh.com`
- `www.toritofresh.com`

Agrega a la VM la etiqueta de red `torito-server`. Después crea las reglas de firewall (cambia
`TU_RED` si la VPC no se llama `default`):

```bash
gcloud compute firewall-rules create torito-allow-http \
  --network=default --direction=INGRESS --action=ALLOW \
  --rules=tcp:80 --source-ranges=0.0.0.0/0 --target-tags=torito-server

gcloud compute firewall-rules create torito-allow-https \
  --network=default --direction=INGRESS --action=ALLOW \
  --rules=tcp:443 --source-ranges=0.0.0.0/0 --target-tags=torito-server
```

Para SSH, conserva la regla existente o limítala a tu IP pública:

```bash
gcloud compute firewall-rules create torito-allow-ssh \
  --network=default --direction=INGRESS --action=ALLOW \
  --rules=tcp:22 --source-ranges=TU_IP_PUBLICA/32 --target-tags=torito-server
```

No crees reglas para 3070, 4070 ni 5432. En Google Cloud deben quedar públicos únicamente
22, 80 y 443. Si usas IAP para SSH, la fuente recomendada por Google es
`35.235.240.0/20` en lugar de tu IP.

## 2. Instalar Git, Docker y Docker Compose

En una VM Ubuntu limpia:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker nginx
sudo usermod -aG docker "$USER"
```

Cierra la sesión SSH y vuelve a entrar para aplicar el grupo `docker`. Comprueba:

```bash
docker --version
docker compose version
```

Opcionalmente activa también el firewall local, después de confirmar que SSH funciona:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 3. Clonar y configurar Torito

```bash
git clone URL_DE_TU_REPOSITORIO.git torito_fresh
cd torito_fresh
cp .env.example .env
chmod 600 .env
nano .env
```

Completa todos los valores obligatorios. Docker Compose construye internamente la conexión a la
base con `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`; el `DATABASE_URL` del ejemplo se
usa solo para desarrollo fuera de Docker. Para evitar errores de URL usa letras, números, `_` y
`-` en la contraseña. Genera el secreto de sesión con:

```bash
openssl rand -base64 48
```

Pega el resultado en `JWT_SECRET`. `DECOLECTA_API_TOKEN` es opcional; sin él solo queda
deshabilitada la consulta automática de DNI/RUC. Define el número real de WhatsApp en formato
internacional, sin `+`, espacios ni guiones.

## 4. Construir y levantar

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f
```

La primera ejecución aplica las migraciones y las restricciones SQL automáticamente. Para una
base nueva, carga una sola vez los catálogos y usuarios iniciales:

```bash
docker compose run --rm migrate npx prisma db seed \
  --schema packages/database/prisma/schema.prisma
```

Las credenciales iniciales descritas en `README.md` son solo de arranque: inicia sesión y cambia
las contraseñas de inmediato. No vuelvas a ejecutar el seed durante actualizaciones normales.

Comprueba localmente en la VM:

```bash
curl --fail http://127.0.0.1:4070/api/health
curl --fail --head http://127.0.0.1:3070/
```

## 5. Configurar Nginx

```bash
sudo cp deploy/nginx/toritofresh.conf /etc/nginx/sites-available/toritofresh.conf
sudo ln -sfn /etc/nginx/sites-available/toritofresh.conf /etc/nginx/sites-enabled/toritofresh.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Antes de solicitar HTTPS, confirma que ambos registros DNS ya resuelven a la IP de la VM:

```bash
curl -I http://toritofresh.com
curl -I http://www.toritofresh.com
```

## 6. Activar HTTPS con Let's Encrypt

Sustituye el correo y ejecuta:

```bash
sudo certbot --nginx \
  -d toritofresh.com -d www.toritofresh.com \
  --redirect --agree-tos --no-eff-email -m TU_CORREO@DOMINIO.COM
```

Certbot crea la sección TLS, redirige HTTP a HTTPS y habilita su temporizador de renovación.
Verifica ambas cosas:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
curl -I https://toritofresh.com
curl --fail https://toritofresh.com/api/health
```

## 7. Operación, logs y actualizaciones

Los logs Docker rotan a 10 MB y conservan tres archivos por servicio. Comandos habituales:

```bash
docker compose ps
docker compose logs -f torito api
docker compose logs --tail=200 migrate
docker compose restart torito api
```

Para actualizar, el script guarda el commit anterior, realiza un respaldo SQL si PostgreSQL
está activo, exige un `git pull` de avance lineal, recompila, aplica migraciones y verifica los
dos servicios:

```bash
chmod +x deploy.sh
./deploy.sh
```

Los datos viven en el volumen `torito_postgres_data`, por lo que sobreviven a
`docker compose down` y `docker compose up -d`. No uses `docker compose down -v`: la opción
`-v` sí elimina el volumen y sus datos.

## 8. Rollback

El script guarda el SHA previo en `.deploy/previous_commit` y un respaldo comprimido en
`backups/`. Para volver al código anterior:

```bash
previous_commit="$(cat .deploy/previous_commit)"
git checkout --detach "$previous_commit"
docker compose build
docker compose up -d --remove-orphans
docker compose ps
```

Después de estabilizar, vuelve a la rama de despliegue antes de la siguiente actualización:

```bash
git switch "$(cat .deploy/branch)"
```

Las migraciones de base de datos no se revierten automáticamente. Si una versión incluyó una
migración incompatible, restaura el respaldo creado antes del despliegue (esto reemplaza el
contenido actual, así que hazlo solo durante una ventana de mantenimiento):

```bash
docker compose stop torito api
docker compose exec -T db sh -ec \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gunzip -c backups/ARCHIVO.sql.gz | docker compose exec -T db sh -ec \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose up -d
```

Conserva además respaldos fuera de la VM para cubrir una pérdida completa del disco y elimina
manualmente los respaldos antiguos cuando ya no sean necesarios.
