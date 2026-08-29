<#
  Crea la Tarea Programada "ToritoKiosk" que al iniciar sesion levanta la app
  y abre Chrome a pantalla completa. Correr COMO ADMINISTRADOR.

  Parametro opcional -User  (por defecto el usuario actual).
#>

param([string]$User = $env:USERNAME)

$ErrorActionPreference = 'Stop'
$vbs = Join-Path $PSScriptRoot 'start-kiosk.vbs'
if (-not (Test-Path $vbs)) { Write-Host "No encuentro start-kiosk.vbs" -ForegroundColor Red; exit 1 }

$action  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}"' -f $vbs)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'ToritoKiosk' -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Tarea 'ToritoKiosk' creada para el usuario '$User'." -ForegroundColor Green
Write-Host "Cierra sesion y vuelve a entrar (o reinicia) para probar."
Write-Host "Para quitarla:  .\uninstall-autostart.ps1"
