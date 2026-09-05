# Torito Fresh — despliegue en Windows

Deja esta PC (`DESKTOP-NJO2TNS`, usuario `user`) para que **al iniciar sesión** levante sola
el backend y el frontend. No abre ningún navegador: el usuario entra por su cuenta a
**`http://localhost:3070`**.

Todo corre en esta misma PC: PostgreSQL (ya instalado, usuario `postgres` / clave
`123456789`), el backend en el puerto 4070 y el frontend en el 3070.

## Requisitos previos

- El repo copiado en `C:\torito_fresh` (esta carpeta es `C:\torito_fresh\deploy\windows`).
- PostgreSQL corriendo.
- Un navegador cualquiera (Firefox, Chrome, Edge) para entrar a la app.
- Conexión a internet la **primera vez** (para instalar Node, `npm install` y los motores de
  Prisma).
- Node.js 20+: si no está, `setup.ps1` lo instala con `winget`.

## Instalación (una sola vez)

**Paso 1 — llevar el código a la PC.** Clónalo o copia la carpeta a `C:\torito_fresh`. Si la
copias a mano, **no copies** `node_modules`, `.next`, `dist` ni `.env`: se generan solos y
copiarlos de otra máquina trae rutas y claves que no corresponden.

**Paso 2 — la clave de PostgreSQL.** `setup.ps1` asume que el usuario `postgres` de esa PC
tiene la clave `123456789` (línea 16 del script, variable `$PgPassword`). Si en esa PC es otra,
edita esa línea antes de seguir; si no, el script falla al conectarse a la base.

**Paso 3 — instalar.** Abre **PowerShell como Administrador** y:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
cd C:\torito_fresh\deploy\windows
.\setup.ps1
```

`setup.ps1` verifica Node, crea la base `torito_fresh` si no existe, genera `C:\torito_fresh\.env`,
instala dependencias, sincroniza la base, carga los datos iniciales y compila la app.

> Si Node no estaba y `setup.ps1` lo instaló: cierra la ventana, abre una **nueva** PowerShell
> como Administrador y vuelve a correr `.\setup.ps1`.

Luego, prueba sin reiniciar:

```powershell
.\start-kiosk.ps1
```

Cuando termine debe decir `Todo listo. Abre el navegador en http://localhost:3070`. Entra a esa
dirección desde el navegador y usa:

| Usuario | Clave |
|---|---|
| `admin` | `admin` |
| `01` / `02` (reparto) | `01` / `02` |

Sugerencia: deja `http://localhost:3070` como página de inicio del navegador y un acceso directo
en el escritorio, así el usuario solo abre el navegador y ya está adentro.

## Autoarranque al iniciar sesión

```powershell
.\install-autostart.ps1
```

Crea la Tarea Programada **ToritoKiosk** para el usuario actual. Cierra sesión y vuelve a
entrar (o reinicia): los servicios arrancan solos en segundo plano y el usuario solo tiene que
abrir el navegador en `http://localhost:3070`.

Para quitar el autoarranque:

```powershell
.\uninstall-autostart.ps1
```

## Mantenimiento

- **Detener la app:** `.\stop-kiosk.ps1` (mata los procesos de los puertos 3070 y 4070)
- **Volver a arrancarla:** `.\start-kiosk.ps1`
- **Recompilar tras actualizar el código** (`git pull` en `C:\torito_fresh`):
  ```powershell
  cd C:\torito_fresh
  npm install
  npm run db:push
  npm run build
  ```
- **Ver la base:** `cd C:\torito_fresh; npm run db:studio`
- Si la clave de `postgres` no es `123456789`, edita `C:\torito_fresh\.env`
  (línea `DATABASE_URL`).

## Notas

- Esto **no** configura el inicio de sesión automático de Windows. Si quieres que la PC entre
  sola a la sesión de `user` al encender, hazlo con `netplwiz` (quitar "Los usuarios deben
  escribir su nombre y contraseña").
- Endurecimiento opcional a futuro: correr el backend y el frontend como servicios de Windows
  (con NSSM) en vez de la tarea programada, para que sigan vivos aunque nadie tenga sesión
  abierta.
- Las claves del seed (`admin`/`admin`, `01`/`01`, `02`/`02`) son de arranque. Cámbialas desde
  la app apenas entres por primera vez.
- Esto queda armado para usarse **solo desde esa PC** (`localhost`). Si más adelante quieres
  entrar desde otras máquinas de la red, hay que poner la IP de la PC servidora en
  `NEXT_PUBLIC_API_URL` y `WEB_ORIGIN` (en `.env` y en `apps\web\.env.local`), recompilar con
  `npm run build` y abrir los puertos 3070 y 4070 en el Firewall de Windows.
