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
$env:PGPASSWORD = $cmsEnv['DB_PASSWORD']
try {
    $psql = Join-Path $PgBin 'psql.exe'
    $exists = & $psql -h 127.0.0.1 -p $Ports.PostgreSQL -U directus -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'directus'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not connect to PostgreSQL with the credentials in cms/.env.' }
    if ($exists -ne '1') {
        & (Join-Path $PgBin 'createdb.exe') -h 127.0.0.1 -p $Ports.PostgreSQL -U directus -E UTF8 directus
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the directus database.' }
        Write-Ok 'created database "directus"'
    }
    $version = & $psql -h 127.0.0.1 -p $Ports.PostgreSQL -U directus -d directus -tAc 'SHOW server_version'
    Write-Ok "connected to database ""directus"" (PostgreSQL $version) with the cms/.env credentials"
} finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }

Write-Step 'Mailpit (local email inbox)'
if (Get-TrackedProcess 'mailpit' $MailpitExe) {
    Write-Ok 'already running'
} else {
    $mailpit = Start-Detached $MailpitExe "--listen 127.0.0.1:$($Ports.Mailpit) --smtp 127.0.0.1:$($Ports.'Mailpit SMTP')" $CmsHome (Join-Path $LogDir 'mailpit.log')
    Save-TrackedProcess 'mailpit' $mailpit
    if (-not (Wait-HttpOk "http://127.0.0.1:$($Ports.Mailpit)/livez" 20)) { throw "Mailpit did not start. See $LogDir\mailpit.log" }
    Write-Ok 'started'
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

Write-Step 'Network exposure check'
foreach ($name in $Ports.Keys) { Assert-LocalOnly $name $Ports[$name] }

Write-Host ''
Write-Host "Staff admin dashboard:  http://localhost:$($Ports.Directus)/admin" -ForegroundColor Green
Write-Host "Local email inbox:      http://localhost:$($Ports.Mailpit)"
Write-Host "Super Admin sign-in:    $($cmsEnv['ADMIN_EMAIL']) (password: ADMIN_PASSWORD in cms\.env)"
Write-Host "Logs:                   $LogDir"
Write-Host 'Stop with:              cms\scripts\windows\stop-cms.ps1'
