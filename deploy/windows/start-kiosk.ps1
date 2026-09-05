<#
  Levanta backend + frontend de Torito Fresh y los deja corriendo en segundo plano.
  NO abre ningun navegador: el usuario entra solo a http://localhost:3070.
  Lo dispara la Tarea Programada al iniciar sesion; tambien se puede correr a mano.
#>

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ApiDir = Join-Path $Root 'apps\api'
$WebDir = Join-Path $Root 'apps\web'
$Url = 'http://localhost:3070'

function Log($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format HH:mm:ss), $m) }

# 1) Limpiar procesos node viejos escuchando en 3070/4070 --------------------
try {
  Get-NetTCPConnection -LocalPort 3070, 4070 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
} catch { }

# 2) API (Nest, puerto 4070). Working dir apps\api para resolver ..\..\.env --
if (-not (Test-Path (Join-Path $ApiDir 'dist\main.js'))) {
  Log "Falta apps\api\dist\main.js. Corre setup.ps1 primero."
  exit 1
}
Log "Arrancando API..."
Start-Process -FilePath 'node' -ArgumentList 'dist\main.js' -WorkingDirectory $ApiDir -WindowStyle Hidden

# 3) Web (Next, puerto 3070) ------------------------------------------------
Log "Arrancando web..."
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = 'npm' }
Start-Process -FilePath $npm -ArgumentList 'run', 'start' -WorkingDirectory $WebDir -WindowStyle Hidden

# 4) Esperar salud (hasta ~90 s) -----------------------------------------
Log "Esperando a que respondan los servicios..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  $apiUp = (Test-NetConnection -ComputerName localhost -Port 4070 -InformationLevel Quiet -WarningAction SilentlyContinue)
  $webUp = $false
  if ($apiUp) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $webUp = $true }
    } catch { }
  }
  if ($apiUp -and $webUp) { $ready = $true; break }
  Start-Sleep -Seconds 1
}

if ($ready) {
  Log "Todo listo. Abre el navegador en $Url"
} else {
  Log "AVISO: los servicios no respondieron en 90s. Revisa que PostgreSQL este corriendo."
  exit 1
}
