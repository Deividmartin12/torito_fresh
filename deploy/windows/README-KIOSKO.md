# Torito Fresh — modo kiosko en Windows

Deja esta PC (`DESKTOP-NJO2TNS`, usuario `user`) para que **al iniciar sesión** levante sola
la app y abra Google Chrome a **pantalla completa en `http://localhost:3070`**.

Todo corre en esta misma PC: PostgreSQL (ya instalado, usuario `postgres` / clave
`123456789`), el backend en el puerto 4070 y el frontend en el 3070.

## Requisitos previos

- El repo copiado en `C:\torito_fresh` (esta carpeta es `C:\torito_fresh\deploy\windows`).
- PostgreSQL corriendo.
- Google Chrome instalado.
- Conexión a internet la **primera vez** (para instalar Node, `npm install` y los motores de
  Prisma).
- Node.js 20+: si no está, `setup.ps1` lo instala con `winget`.

## Instalación (una sola vez)

Abre **PowerShell como Administrador** y:

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

Debe abrir Chrome a pantalla completa con la pantalla de inicio de sesión. Entra con:

| Usuario | Clave |
|---|---|
| `admin` | `admin` |
| `01` / `02` (reparto) | `01` / `02` |

Para salir de Chrome kiosko: **Alt + F4**.

## Autoarranque al iniciar sesión

```powershell
.\install-autostart.ps1
```

Crea la Tarea Programada **ToritoKiosk** para el usuario actual. Cierra sesión y vuelve a
entrar (o reinicia): la app arranca sola.

Para quitar el autoarranque:

```powershell
.\uninstall-autostart.ps1
```

## Mantenimiento

- **Detener la app:** `.\stop-kiosk.ps1`
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
