<# Quita la Tarea Programada "ToritoKiosk". Correr COMO ADMINISTRADOR. #>
$ErrorActionPreference = 'Stop'
if (Get-ScheduledTask -TaskName 'ToritoKiosk' -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName 'ToritoKiosk' -Confirm:$false
  Write-Host "Tarea 'ToritoKiosk' eliminada." -ForegroundColor Green
} else {
  Write-Host "La tarea 'ToritoKiosk' no existe."
}
