<#
  Actualiza Torito Fresh en la PC del negocio a la ultima version del codigo.

      cd C:\torito_fresh\deploy\windows
      .\update.ps1

  A diferencia de setup.ps1, este script NO corre el seed: el seed reescribe las claves de
  admin/01/02 con las de fabrica y borraria los cambios de contrasena del negocio.
  Tampoco toca el .env ni vuelve a crear la tarea programada: eso ya esta hecho.

  Si el repo no se actualiza con git (lo copias a mano), copia los archivos nuevos ANTES
  de correr este script; el paso de git se salta solo.
#>

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# 1) Bajar la app para que no queden archivos en uso -------------------------
Write-Step "Deteniendo la app"
& (Join-Path $PSScriptRoot 'stop-kiosk.ps1')

Push-Location $Root
try {
  # 2) Traer el codigo nuevo (solo si es un repo git) ------------------------
  if ((Test-Path (Join-Path $Root '.git')) -and (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Step "git pull"
    & git pull
    if ($LASTEXITCODE -ne 0) { Fail "git pull fallo. Resuelve el conflicto y vuelve a correr .\update.ps1" }
  } else {
    Write-Step "Sin git: se usa el codigo que ya esta en $Root"
  }

  # 3) Dependencias, base y build -------------------------------------------
  Write-Step "npm install"
  & npm install
  if ($LASTEXITCODE -ne 0) { Fail "npm install fallo." }

  Write-Step "Prisma generate"
  & npm run db:generate
  if ($LASTEXITCODE -ne 0) { Fail "db:generate fallo." }

  Write-Step "Actualizando el esquema de la base (db:push + constraints)"
  & npm run db:push
  if ($LASTEXITCODE -ne 0) { Fail "db:push fallo." }

  Write-Step "Build de produccion"
  & npm run build
  if ($LASTEXITCODE -ne 0) { Fail "npm run build fallo." }
}
finally { Pop-Location }

# 4) Volver a levantar ------------------------------------------------------
Write-Step "Levantando la app"
& (Join-Path $PSScriptRoot 'start-kiosk.ps1')
