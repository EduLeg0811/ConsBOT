@echo off
REM Sobe Main-Server + frontend escondidos e abre o navegador.
REM Dois cliques neste arquivo. Para encerrar: dev-stop.cmd
REM Saída dos dois processos vai para .\logs\ (server.*.log e frontend.*.log).
set "PSEXE=powershell"
where pwsh >nul 2>&1 && set "PSEXE=pwsh"
start "" %PSEXE% -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0dev.ps1" -Silent
