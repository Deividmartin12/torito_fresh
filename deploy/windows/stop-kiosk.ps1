<#
  Detiene la app (para mantenimiento): mata los procesos node que escuchan en
  los puertos 3070 / 4070. No toca el navegador: eso lo cierra el usuario.
#>

Get-NetTCPConnection -LocalPort 3070, 4070 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Write-Host "Torito Fresh detenido." -ForegroundColor Green
