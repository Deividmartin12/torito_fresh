<#
  Levanta backend + frontend de Torito Fresh y abre Chrome a pantalla completa
  en http://localhost:3070. Lo dispara la Tarea Programada al iniciar sesion;
  tambien se puede correr a mano para probar.
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
if ($ready) { Log "Servicios arriba." } else { Log "AVISO: no confirme salud en 90s; abro Chrome igual." }

# 5) Chrome kiosko ---------------------------------------------------------
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { Log "No encuentro chrome.exe."; exit 1 }
Log "Abriendo Chrome kiosko: $chrome"
& $chrome `
  --kiosk `
  --app=$Url `
  --user-data-dir="$env:LOCALAPPDATA\ToritoKiosk" `
  --no-first-run `
  --no-default-browser-check `
  --disable-features=TranslateUI `
  --overscroll-history-navigation=0
