@echo off
REM Encerra o Main-Server e o frontend iniciados por dev-silent.cmd ou dev.ps1.
set "PSEXE=powershell"
where pwsh >nul 2>&1 && set "PSEXE=pwsh"
%PSEXE% -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Stop
