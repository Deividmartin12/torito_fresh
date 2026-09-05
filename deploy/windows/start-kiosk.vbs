' Lanza start-kiosk.ps1 (levanta API + web) sin mostrar ninguna ventana de consola.
Dim shell, here, ps1
Set shell = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
ps1 = here & "\start-kiosk.ps1"
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
