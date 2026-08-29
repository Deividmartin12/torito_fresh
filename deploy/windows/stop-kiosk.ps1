<#
  Detiene la app de kiosko (para mantenimiento): cierra el Chrome del perfil
  kiosko y los procesos node de los puertos 3070 / 4070.
#>

# Chrome del perfil kiosko
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'ToritoKiosk' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# node de 3070 / 4070
Get-NetTCPConnection -LocalPort 3070, 4070 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Write-Host "Kiosko detenido." -ForegroundColor Green
