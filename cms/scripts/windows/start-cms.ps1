# Starts the local CMS: PostgreSQL, Mailpit and Directus, all bound to 127.0.0.1.
# Already-running services are left alone, so it is safe to run twice.
#   powershell -NoProfile -ExecutionPolicy Bypass -File cms\scripts\windows\start-cms.ps1
. "$PSScriptRoot\CmsCommon.ps1"

if (-not (Test-Path (Join-Path $PgData 'PG_VERSION')) -or -not (Test-Path $Node22) -or -not (Test-Path (Join-Path $ServerDir 'node_modules\directus'))) {
    throw 'The CMS is not set up yet. Run cms\scripts\windows\setup-cms.ps1 first.'
}
$cmsEnv = Read-CmsEnv
New-Item -ItemType Directory -Force $LogDir, $RunDir | Out-Null
$env:BRIDTOWN_CMS_HOME = $CmsHome

Write-Step 'PostgreSQL'
if (Test-PostgresRunning) {
    Write-Ok 'already running'
} else {
    $code = Invoke-PgCtl @('start', '-D', $PgData, '-l', (Join-Path $LogDir 'postgres.log'), '-w', '-t', '60', '-o', "-p $($Ports.PostgreSQL) -c listen_addresses=127.0.0.1")
    if ($code -ne 0) { throw "PostgreSQL did not start. See $LogDir\postgres.log" }
    Write-Ok 'started'
}
# Checked with Node rather than psql.exe, which Windows Smart App Control blocks.
Push-Location $ServerDir
try {
    $version = & $Node22 'check-db.mjs'
    if ($LASTEXITCODE -ne 0) { $version; throw 'Could not connect to PostgreSQL with the credentials in cms/.env.' }
} finally { Pop-Location }
Write-Ok "connected to database ""directus"" (PostgreSQL $($version -join ' ')) with the cms/.env credentials"

Write-Step 'Mailpit (local email inbox)'
if (Get-TrackedProcess 'mailpit' $MailpitExe) {
    Write-Ok 'already running'
} else {
    # Optional: only needed for password-reset and invite emails. Smart App Control
    # may block the unsigned mailpit.exe, so a failure here does not stop the admin.
    try {
        $mailpit = Start-Detached $MailpitExe "--listen 127.0.0.1:$($Ports.Mailpit) --smtp 127.0.0.1:$($Ports.'Mailpit SMTP')" $CmsHome (Join-Path $LogDir 'mailpit.log')
        Save-TrackedProcess 'mailpit' $mailpit
        if (-not (Wait-HttpOk "http://127.0.0.1:$($Ports.Mailpit)/livez" 20)) { throw 'no response' }
        Write-Ok 'started'
    } catch {
        Write-Host "   skipped: Mailpit could not start (Windows may be blocking mailpit.exe). Admin sign-in still works; emails will not be delivered." -ForegroundColor Yellow
    }
}

Write-Step 'Directus'
$runner = Join-Path $ServerDir 'run-directus.mjs'
if ((Get-TrackedProcess 'directus' $Node22) -and (Wait-HttpOk "http://127.0.0.1:$($Ports.Directus)/server/ping" 5)) {
    Write-Ok 'already running'
} else {
    # Creates or upgrades the Directus tables and, on first run only, the Super Admin account.
    Push-Location $ServerDir
    try {
        & $Node22 $runner bootstrap *> (Join-Path $LogDir 'directus-bootstrap.log')
        if ($LASTEXITCODE -ne 0) { throw "Directus bootstrap failed. See $LogDir\directus-bootstrap.log" }
    } finally { Pop-Location }
    Write-Ok 'database schema ready'
    $directus = Start-Detached $Node22 'run-directus.mjs start' $ServerDir (Join-Path $LogDir 'directus.log')
    Save-TrackedProcess 'directus' $directus
    if (-not (Wait-HttpOk "http://127.0.0.1:$($Ports.Directus)/server/ping" 120)) {
        Get-Content (Join-Path $LogDir 'directus.log') -Tail 20 -ErrorAction SilentlyContinue
        throw "Directus did not start. See $LogDir\directus.log"
    }
    Write-Ok 'started'
}

foreach ($name in $WebsiteServices.Keys) {
    $service = $WebsiteServices[$name]
    Write-Step $service.Title
    $node = Get-ProjectNode
    $running = Get-TrackedProcess $name $node
    if (-not $running) { $running = Find-ScriptProcess $service.Script; if ($running) { Save-TrackedProcess $name $running } }
    if ($running) { Write-Ok "already running (process $($running.Id))"; continue }
    $process = Start-Detached $node $service.Script $RepoRoot (Join-Path $LogDir "$name.log")
    Save-TrackedProcess $name $process
    Write-Ok "started (log: $(Join-Path $LogDir "$name.log"))"
}
if (-not (Wait-HttpOk "http://127.0.0.1:$($Ports.'Rebuild listener')/status" 20)) { Write-Warning "The rebuild listener is not answering; see $(Join-Path $LogDir 'rebuild-listener.log')" }

Write-Step 'Network exposure check'
foreach ($name in $Ports.Keys) {
    if ($name -like 'Mailpit*' -and (Get-Listeners $Ports[$name]).Count -eq 0) { continue }  # optional, may be blocked
    Assert-LocalOnly $name $Ports[$name]
}

Write-Host ''
Write-Host "Staff admin dashboard:  http://localhost:$($Ports.Directus)/admin" -ForegroundColor Green
if ((Get-Listeners $Ports.Mailpit).Count -gt 0) {
    Write-Host "Local email inbox:      http://localhost:$($Ports.Mailpit)"
} else {
    Write-Host 'Local email inbox:      not running (password-reset and invite emails are not sent)' -ForegroundColor Yellow
}
Write-Host "Local website preview:  npm run preview (serves the last successful CMS build in dist/)"
Write-Host "Super Admin sign-in:    $($cmsEnv['ADMIN_EMAIL']) (password: ADMIN_PASSWORD in cms\.env)"
Write-Host "Logs:                   $LogDir"
Write-Host 'Stop with:              cms\scripts\windows\stop-cms.ps1'
