# dev.ps1 — sobe o Main-Server (FastAPI) e o frontend (Vite) neste terminal.
#   .\dev.ps1                            -> Main-Server em ..\Main-Server + Vite
#   .\dev.ps1 -NoServer                  -> só o Vite, contra um Main-Server já rodando em 127.0.0.1:8000
#   .\dev.ps1 -ServerPath D:\outro\path  -> Main-Server em outro diretório
#   .\dev.ps1 -ServerPort 8010           -> porta do Main-Server (default: 8000, o mesmo default de
#                                            DEFAULT_API_BASE em src/lib/main-server.ts)
param(
    [string]$ServerPath = "",
    [int]$ServerPort = 8000,
    [switch]$NoServer
)

$root = $PSScriptRoot

function Stop-ProcessTree {
    param([int]$ParentId)
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ProcessTree -ParentId $_.ProcessId
    }
    Stop-Process -Id $ParentId -Force -ErrorAction SilentlyContinue
}

function Stop-OrphanedProcess {
    param([string]$PidFile, [string[]]$ExpectedNames)
    if (Test-Path $PidFile) {
        $pidVal = Get-Content $PidFile -Raw -ErrorAction SilentlyContinue
        if ($pidVal -and $pidVal -match '^\d+$') {
            $proc = Get-Process -Id ([int]$pidVal) -ErrorAction SilentlyContinue
            if ($proc -and ($ExpectedNames | Where-Object { $proc.Name -eq $_ -or $proc.Name -like "*$_*" })) {
                Write-Host "Finalizando instância órfã anterior (PID $pidVal)..." -ForegroundColor Yellow
                Stop-ProcessTree -ParentId ([int]$pidVal)
            }
        }
        Remove-Item $PidFile -ErrorAction SilentlyContinue
    }
}

function Get-FreePort {
    param([int]$StartPort)
    $port = $StartPort
    while ($true) {
        $properties = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties()
        $inUse = ($properties.GetActiveTcpListeners().Port) + ($properties.GetActiveTcpConnections().LocalEndPoint.Port)
        if ($port -notin $inUse) { return $port }
        $port++
    }
}

# Limpar processos órfãos de execuções anteriores
Stop-OrphanedProcess -PidFile "$root\.server.pid" -ExpectedNames @("powershell", "pwsh", "python")
Stop-OrphanedProcess -PidFile "$root\.frontend.pid" -ExpectedNames @("cmd", "node", "npm")

# Localizar o Main-Server
if (-not $ServerPath) {
    $ServerPath = Join-Path (Split-Path $root -Parent) "Main-Server"
}
$serverScript = Join-Path $ServerPath "run_dev.ps1"

if (-not $NoServer -and -not (Test-Path $serverScript)) {
    Write-Warning "Main-Server não encontrado em '$ServerPath'. Subindo apenas o frontend."
    Write-Warning "Use -ServerPath para indicar o diretório correto, ou -NoServer para silenciar este aviso."
    $NoServer = $true
}

$frontendPort = Get-FreePort -StartPort 5173

# src/lib/main-server.ts já usa http://127.0.0.1:8000 como default; só precisamos
# apontar para outro lugar se -ServerPort mudar isso.
if ($ServerPort -ne 8000) {
    $env:VITE_MAIN_SERVER_URL = "http://127.0.0.1:$ServerPort"
}

$processes = @()

if (-not $NoServer) {
    # run_dev.ps1 do Main-Server é UTF-8 sem BOM; pwsh 7 preserva os acentos.
    $psExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }
    $server = Start-Process $psExe `
        -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "run_dev.ps1", "-Port", $ServerPort `
        -WorkingDirectory $ServerPath -NoNewWindow -PassThru
    $server.Id | Out-File -FilePath "$root\.server.pid" -NoNewline -Encoding ascii
    $processes += $server
}

$npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
$frontend = Start-Process $npmCmd -ArgumentList "run", "dev", "--", "--port", $frontendPort -WorkingDirectory $root -NoNewWindow -PassThru
$frontend.Id | Out-File -FilePath "$root\.frontend.pid" -NoNewline -Encoding ascii
$processes += $frontend

Start-Sleep -Seconds 2
Start-Process "http://localhost:$frontendPort/"

if ($NoServer) {
    Write-Host "Main-Server: usando instância externa em http://127.0.0.1:$ServerPort"
} else {
    Write-Host "Main-Server (PID $($server.Id)) na porta $ServerPort  (docs: http://127.0.0.1:$ServerPort/docs)"
}
Write-Host "Frontend (PID $($frontend.Id)) na porta $frontendPort"
Write-Host "Pressione Ctrl+C para encerrar."

try {
    Wait-Process -Id ($processes | ForEach-Object { $_.Id }) -ErrorAction SilentlyContinue
} finally {
    foreach ($proc in $processes) {
        Stop-ProcessTree -ParentId $proc.Id
    }
    Remove-Item "$root\.server.pid" -ErrorAction SilentlyContinue
    Remove-Item "$root\.frontend.pid" -ErrorAction SilentlyContinue
}
