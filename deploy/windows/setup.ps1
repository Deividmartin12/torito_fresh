<#
  Torito Fresh - instalacion unica en Windows.
  Correr en PowerShell COMO ADMINISTRADOR:

      Set-ExecutionPolicy -Scope Process Bypass -Force
      cd C:\torito_fresh\deploy\windows
      .\setup.ps1

  Deja la app compilada y la base de datos lista. Luego correr install-autostart.ps1.
#>

$ErrorActionPreference = 'Stop'

# Raiz del repo = dos niveles arriba de este script (deploy\windows\).
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$PgPassword = '123456789'   # clave del usuario 'postgres' en esta PC
$DbName = 'torito_fresh'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Step "Repo: $Root"
if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  Fail "No encuentro package.json en $Root. Copia este paquete dentro del repo (C:\torito_fresh\deploy\windows)."
}

# 1) Node.js >= 20 ----------------------------------------------------------------
Write-Step "Node.js"
$nodeOk = $false
try {
  $v = (& node -v) 2>$null
  if ($v -match 'v(\d+)\.') { if ([int]$Matches[1] -ge 20) { $nodeOk = $true; Write-Host "Node $v OK" } }
} catch { }
if (-not $nodeOk) {
  Write-Host "Node 20+ no detectado. Intentando instalar con winget..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Fail "Se instalo Node. CIERRA esta ventana, abre una NUEVA PowerShell como Administrador y vuelve a correr .\setup.ps1"
  } else {
    Fail "winget no esta disponible. Instala Node 20 LTS desde https://nodejs.org/ y vuelve a correr .\setup.ps1"
  }
}

# 2) PostgreSQL (psql) ----------------------------------------------------------
Write-Step "PostgreSQL"
$psql = $null
$candidates = @()
if (Get-Command psql -ErrorAction SilentlyContinue) { $candidates += (Get-Command psql).Source }
$candidates += Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -ExpandProperty FullName
$psql = $candidates | Select-Object -First 1
if (-not $psql) { Fail "No encuentro psql.exe. Confirma que PostgreSQL esta instalado." }
Write-Host "psql: $psql"

# 3) Crear la base si no existe -----------------------------------------------
Write-Step "Base de datos '$DbName'"
$env:PGPASSWORD = $PgPassword
$exists = (& $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'") 2>&1
if ($LASTEXITCODE -ne 0) { Fail "No pude conectar a PostgreSQL como 'postgres'. Revisa la clave (esperada: $PgPassword) y que el servicio este corriendo. Salida: $exists" }
if ("$exists".Trim() -ne '1') {
  & $psql -U postgres -h localhost -c "CREATE DATABASE $DbName;"
  Write-Host "Base creada."
} else {
  Write-Host "La base ya existe."
}

# 4) .env ---------------------------------------------------------------------
Write-Step ".env"
$envPath = Join-Path $Root '.env'
if (Test-Path $envPath) {
  Write-Host ".env ya existe, no lo toco."
} else {
  $chars = @() + (48..57) + (65..90) + (97..122)
  $jwt = -join ($chars | Get-Random -Count 40 | ForEach-Object { [char]$_ })
  $dbUrl = 'postgresql://postgres:' + $PgPassword + '@localhost:5432/' + $DbName + '?schema=public'
  @(
    'DATABASE_URL="' + $dbUrl + '"'
    'JWT_SECRET="' + $jwt + '"'
    'NEXT_PUBLIC_API_URL="http://localhost:4070"'
    'WEB_ORIGIN="http://localhost:3070"'
  ) | Set-Content -Path $envPath -Encoding ascii
  Write-Host "Creado $envPath"
}

# Next.js solo lee los .env que estan dentro de apps/web, por eso ademas del .env de la
# raiz hay que crear este. Sin el, la web queda apuntando fijo a localhost:4070.
$webEnvPath = Join-Path $Root 'apps\web\.env.local'
if (Test-Path $webEnvPath) {
  Write-Host "apps\web\.env.local ya existe, no lo toco."
} else {
  'NEXT_PUBLIC_API_URL="http://localhost:4070"' | Set-Content -Path $webEnvPath -Encoding ascii
  Write-Host "Creado $webEnvPath"
}

# 5) Dependencias + build + base --------------------------------------------
Push-Location $Root
try {
  Write-Step "npm install (puede tardar varios minutos)"
  & npm install
  if ($LASTEXITCODE -ne 0) { Fail "npm install fallo." }

  Write-Step "Prisma generate"
  & npm run db:generate
  if ($LASTEXITCODE -ne 0) { Fail "db:generate fallo (revisa conexion a internet para los motores de Prisma)." }

  Write-Step "Prisma db push + constraints"
  & npm run db:push
  if ($LASTEXITCODE -ne 0) { Fail "db:push fallo." }

  Write-Step "Seed (usuarios admin/admin, 01/01, 02/02 + catalogos)"
  & npm run db:seed
  if ($LASTEXITCODE -ne 0) { Fail "db:seed fallo." }

  Write-Step "Build de produccion (apps/api y apps/web)"
  & npm run build
  if ($LASTEXITCODE -ne 0) { Fail "npm run build fallo." }
}
finally { Pop-Location }

# Chequeo de salidas de build
$apiMain = Join-Path $Root 'apps\api\dist\main.js'
$webNext = Join-Path $Root 'apps\web\.next'
if (-not (Test-Path $apiMain)) { Fail "Falta apps\api\dist\main.js tras el build." }
if (-not (Test-Path $webNext)) { Fail "Falta apps\web\.next tras el build." }

Write-Host "`nLISTO." -ForegroundColor Green
Write-Host "Prueba ahora:      .\start-kiosk.ps1"
Write-Host "Luego entra a:     http://localhost:3070"
Write-Host "Autoarranque:      .\install-autostart.ps1"
