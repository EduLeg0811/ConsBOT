# dev.ps1 — sobe o Main-Server (FastAPI) e o frontend (Vite) neste terminal.
#   .\dev.ps1                            -> Main-Server em ..\Main-Server + Vite
#   .\dev.ps1 -NoServer                  -> só o Vite, contra um Main-Server já rodando em 127.0.0.1:8000
#   .\dev.ps1 -ServerPath D:\outro\path  -> Main-Server em outro diretório
#   .\dev.ps1 -ServerPort 8010           -> porta do Main-Server (default: 8000, o mesmo default de
#                                            DEFAULT_API_BASE em src/lib/main-server.ts)
#   .\dev.ps1 -Silent                    -> sem janela e sem saída no console; tudo vai para .\logs\.
#                                            Use .\dev.ps1 -Stop (ou dev-stop.cmd) para encerrar.
#   .\dev.ps1 -Stop                      -> encerra o que estiver rodando, pelos arquivos .pid
#
# Atalhos: dev-silent.cmd (dois cliques, sobe tudo escondido) e dev-stop.cmd.
param(
    [string]$ServerPath = "",
    [int]$ServerPort = 8000,
    [switch]$NoServer,
    [switch]$Silent,
    [switch]$Stop
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

$pidFiles = @("$root\.dev.pid", "$root\.server.pid", "$root\.frontend.pid")

function Write-Status {
    param([string]$Message, [string]$Color = "Gray")
    # Em -Silent não há console para escrever: a janela é oculta.
    if (-not $Silent) { Write-Host $Message -ForegroundColor $Color }
}

# -Stop encerra uma sessão anterior (tipicamente iniciada com -Silent, que não
# tem console para receber Ctrl+C) e sai. Matar a árvore do supervisor derruba
# junto o Main-Server e o Vite, que são filhos dele.
if ($Stop) {
    $stopped = 0
    foreach ($file in $pidFiles) {
        if (-not (Test-Path $file)) { continue }
        $value = (Get-Content $file -Raw -ErrorAction SilentlyContinue).Trim()
        if ($value -match '^\d+$' -and (Get-Process -Id ([int]$value) -ErrorAction SilentlyContinue)) {
            Stop-ProcessTree -ParentId ([int]$value)
            $stopped++
        }
        Remove-Item $file -ErrorAction SilentlyContinue
    }
    if ($stopped -gt 0) { Write-Host "Encerrado ($stopped processo(s))." -ForegroundColor Yellow }
    else { Write-Host "Nada rodando." -ForegroundColor Gray }
    return
}

# Limpar processos órfãos de execuções anteriores
Stop-OrphanedProcess -PidFile "$root\.server.pid" -ExpectedNames @("powershell", "pwsh", "python")
Stop-OrphanedProcess -PidFile "$root\.frontend.pid" -ExpectedNames @("cmd", "node", "npm")
Stop-OrphanedProcess -PidFile "$root\.dev.pid" -ExpectedNames @("powershell", "pwsh")

# O próprio supervisor: é por ele que -Stop derruba a árvore inteira.
$PID | Out-File -FilePath "$root\.dev.pid" -NoNewline -Encoding ascii

# Em -Silent ninguém vê stdout/stderr; sem redirecionar, a saída se perde.
$logDir = Join-Path $root "logs"
if ($Silent) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

function Get-LaunchArgs {
    param([string]$Name)
    if ($Silent) {
        return @{
            WindowStyle            = "Hidden"
            RedirectStandardOutput = Join-Path $logDir "$Name.out.log"
            RedirectStandardError  = Join-Path $logDir "$Name.err.log"
        }
    }
    return @{ NoNewWindow = $true }
}

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
    $serverLaunch = Get-LaunchArgs "server"
    $server = Start-Process $psExe `
        -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "run_dev.ps1", "-Port", $ServerPort `
        -WorkingDirectory $ServerPath -PassThru @serverLaunch
    $server.Id | Out-File -FilePath "$root\.server.pid" -NoNewline -Encoding ascii
    $processes += $server
}

$npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
$frontendLaunch = Get-LaunchArgs "frontend"
$frontend = Start-Process $npmCmd -ArgumentList "run", "dev", "--", "--port", $frontendPort `
    -WorkingDirectory $root -PassThru @frontendLaunch
$frontend.Id | Out-File -FilePath "$root\.frontend.pid" -NoNewline -Encoding ascii
$processes += $frontend

Start-Sleep -Seconds 2
Start-Process "http://localhost:$frontendPort/"

if ($NoServer) {
    Write-Status "Main-Server: usando instância externa em http://127.0.0.1:$ServerPort"
} else {
    Write-Status "Main-Server (PID $($server.Id)) na porta $ServerPort  (docs: http://127.0.0.1:$ServerPort/docs)"
}
Write-Status "Frontend (PID $($frontend.Id)) na porta $frontendPort"
Write-Status "Pressione Ctrl+C para encerrar."

try {
    Wait-Process -Id ($processes | ForEach-Object { $_.Id }) -ErrorAction SilentlyContinue
} finally {
    foreach ($proc in $processes) {
        Stop-ProcessTree -ParentId $proc.Id
    }
    foreach ($file in $pidFiles) { Remove-Item $file -ErrorAction SilentlyContinue }
}
