# Shared settings and helpers for the native Windows CMS scripts (Windows PowerShell 5.1+).
# Dot-source from the other scripts:  . "$PSScriptRoot\CmsCommon.ps1"
#
# Runtime files live outside the repository, per user, with no administrator rights:
#   %LOCALAPPDATA%\BridTownCMS\  pgsql (PostgreSQL 17), node22 (Node for Directus), mailpit,
#                                pgdata (database), uploads (media), logs, run (process ids)
# Override the location with the BRIDTOWN_CMS_HOME environment variable.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3

$RepoRoot  = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$CmsDir    = Join-Path $RepoRoot 'cms'
$ServerDir = Join-Path $CmsDir 'server'
$EnvFile   = Join-Path $CmsDir '.env'
if ($env:BRIDTOWN_CMS_HOME) { $CmsHome = $env:BRIDTOWN_CMS_HOME } else { $CmsHome = Join-Path $env:LOCALAPPDATA 'BridTownCMS' }
$PgBin     = Join-Path $CmsHome 'pgsql\bin'
$PgData    = Join-Path $CmsHome 'pgdata'
$Node22    = Join-Path $CmsHome 'node22\node.exe'
$Npm22     = Join-Path $CmsHome 'node22\node_modules\npm\bin\npm-cli.js'
$MailpitExe = Join-Path $CmsHome 'mailpit\mailpit.exe'
$LogDir    = Join-Path $CmsHome 'logs'
$RunDir    = Join-Path $CmsHome 'run'

# Keep in step with cms/server/directus-env.mjs.
$Ports = [ordered]@{ Directus = 8055; PostgreSQL = 5433; Mailpit = 8025; 'Mailpit SMTP' = 1025; 'Rebuild listener' = 4400; 'Website preview' = 4321 }

# Website services run with the project's normal Node (not Node 22, which is only for Directus).
$WebsiteServices = [ordered]@{
    'rebuild-listener' = @{ Title = 'Website rebuild listener'; Script = 'cms/scripts/rebuild-listener.mjs' }
    'match-scheduler'  = @{ Title = 'Match data scheduler';     Script = 'scripts/matches/scheduler.mjs' }
    # Serves dist/ (the last successful CMS build) at http://localhost:4321; rebuilds replace it in place.
    'website-preview'  = @{ Title = 'Website preview';          Script = 'node_modules/astro/astro.js preview --host 127.0.0.1 --port 4321' }
}
function Get-ProjectNode { (Get-Command node -ErrorAction Stop).Source }

function Write-Step([string] $Message) { Write-Host "-> $Message" -ForegroundColor Cyan }
function Write-Ok([string] $Message) { Write-Host "   $Message" -ForegroundColor Green }
function Write-Note([string] $Message) { Write-Host "   $Message" }

function Read-CmsEnv {
    if (-not (Test-Path $EnvFile)) { throw "cms/.env not found. Run cms\scripts\windows\setup-cms.ps1 first." }
    $values = @{}
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
    }
    return $values
}

function Get-Listeners([int] $Port) {
    # The leading comma keeps an empty result as an empty array rather than $null.
    return , @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

# Fails if anything listens on the port on an address other than loopback.
function Assert-LocalOnly([string] $Name, [int] $Port) {
    $listeners = Get-Listeners $Port
    if ($listeners.Count -eq 0) { throw "$Name is not listening on port $Port." }
    $exposed = @($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') })
    if ($exposed.Count -gt 0) {
        throw "$Name is listening on $($exposed[0].LocalAddress):$Port, which is reachable from the network. Stop it with stop-cms.ps1."
    }
    Write-Ok ("{0,-13} 127.0.0.1:{1} (this computer only)" -f $Name, $Port)
}

# Process id files: only trust a recorded id if it still belongs to the expected program.
function Get-TrackedProcess([string] $Name, [string] $ExpectedPath) {
    $pidFile = Join-Path $RunDir "$Name.pid"
    if (-not (Test-Path $pidFile)) { return $null }
    $process = Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue
    if ($process -and $process.Path -and ((Resolve-Path $process.Path).Path -eq (Resolve-Path $ExpectedPath).Path)) { return $process }
    Remove-Item $pidFile -Force
    return $null
}

# A website service already running from this project but not recorded (for example started by
# hand with npm run cms:listen): returns it so it is adopted rather than started twice.
function Find-ScriptProcess([string] $Script) {
    # Script path plus its first argument (if any); quotes Windows adds around paths are skipped by the wildcards.
    $words = @($Script -split ' ' | Select-Object -First 2)
    $pattern = '*' + (($words -join '*') -replace '/', '*') + '*'
    $found = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like $pattern -and $_.CommandLine -notlike '*--once*' } | Select-Object -First 1
    if ($found) { return Get-Process -Id $found.ProcessId -ErrorAction SilentlyContinue }
    return $null
}

function Save-TrackedProcess([string] $Name, $Process) {
    New-Item -ItemType Directory -Force $RunDir | Out-Null
    Set-Content -Path (Join-Path $RunDir "$Name.pid") -Value $Process.Id -Encoding ascii
}

function Stop-TrackedProcess([string] $Name, [string] $ExpectedPath) {
    $process = Get-TrackedProcess $Name $ExpectedPath
    if (-not $process) { Write-Note "$Name is not running"; return }
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit(15000) | Out-Null
    Remove-Item (Join-Path $RunDir "$Name.pid") -Force -ErrorAction SilentlyContinue
    Write-Ok "$Name stopped"
}

# Runs pg_ctl through the Windows shell (hidden window) and waits for pg_ctl only. Launched
# any other way, the server it starts inherits this script's output handles and keeps them
# open, so whatever is reading the script's output (a pipe, npm, a CI runner) never finishes.
# The server's own log is written by pg_ctl -l.
function Invoke-PgCtl([string[]] $Arguments) {
    $quoted = $Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
    $process = Start-Process -FilePath (Join-Path $PgBin 'pg_ctl.exe') -ArgumentList ($quoted -join ' ') -WindowStyle Hidden -PassThru
    $null = $process.Handle   # without this, Windows PowerShell 5.1 reports no exit code
    $process.WaitForExit()
    return $process.ExitCode
}

# Starts a long-running program detached from this script: a hidden cmd.exe (launched through
# the Windows shell, so it inherits none of our handles) runs it with output sent to a log
# file. Returns the program's own process, which is what Stop-TrackedProcess later stops.
function Start-Detached([string] $Exe, [string] $Arguments, [string] $WorkingDirectory, [string] $Log) {
    $command = "/d /c `"`"$Exe`" $Arguments > `"$Log`" 2>&1`""
    $shell = Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" -ArgumentList $command -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru
    $name = Split-Path $Exe -Leaf
    for ($i = 0; $i -lt 50; $i++) {
        $child = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($shell.Id)" | Where-Object { $_.Name -eq $name } | Select-Object -First 1
        if ($child) { return Get-Process -Id $child.ProcessId }
        if ($shell.HasExited) { break }
        Start-Sleep -Milliseconds 200
    }
    throw "$name did not start. See $Log"
}

function Test-PostgresRunning {
    & (Join-Path $PgBin 'pg_ctl.exe') status -D $PgData *> $null
    return ($LASTEXITCODE -eq 0)
}

function Wait-HttpOk([string] $Url, [int] $TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return $true }
        } catch { }
        Start-Sleep -Milliseconds 1000
    }
    return $false
}
