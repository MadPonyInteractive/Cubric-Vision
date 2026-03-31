---
description: backup
---

create a backup: 
with the exception of the folders [Backup,data,engine,llama_engine,node_modules,projects], copy all files and folders to the Backup folder, overwrite existing.

// turbo
1. Run the following command in PowerShell to perform the backup:
```powershell
if (!(Test-Path "Backup")) { New-Item -ItemType Directory -Path "Backup" }; Get-ChildItem -Path . | Where-Object { $_.Name -notin @("Backup", "data", "engine", "llama_engine", "node_modules", "projects") } | ForEach-Object { Copy-Item -Path $_.FullName -Destination "Backup" -Recurse -Force }
```