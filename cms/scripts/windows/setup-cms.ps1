# One-time setup of the native Windows CMS. Safe to re-run: each step is skipped once done.
# No administrator rights, no system-wide installs, nothing outside %LOCALAPPDATA%\BridTownCMS
# and this repository. Downloads are checked against pinned SHA-256 hashes.
#   powershell -NoProfile -ExecutionPolicy Bypass -File cms\scripts\windows\setup-cms.ps1
. "$PSScriptRoot\CmsCommon.ps1"

$Downloads = @(
    @{ Name = 'PostgreSQL 17.11'; Folder = 'pgsql'; Check = 'pgsql\bin\postgres.exe'
       Url = 'https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip'
       # EDB does not publish checksums; pinned from the first verified download (2026-10-15).
       Sha256 = '80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F' },
    @{ Name = 'Node.js 22.23.3 (for Directus)'; Folder = 'node22'; Check = 'node22\node.exe'; Rename = 'node-v22.23.3-win-x64'
       Url = 'https://nodejs.org/dist/v22.23.3/node-v22.23.3-win-x64.zip'
       Sha256 = '2B0FF57B049CDA1BBCEA2240EEC20467018713C1EFE1F7360C2681859B90ED71' },
    @{ Name = 'Mailpit 1.31.5'; Folder = 'mailpit'; Check = 'mailpit\mailpit.exe'; Into = 'mailpit'
       Url = 'https://github.com/axllent/mailpit/releases/download/v1.31.5/mailpit-windows-amd64.zip'
       Sha256 = '9637E21C02B33185FE69268BA05317152A5D8AC7877115E8A70E29B7E199E8DC' }
)

Write-Step "Runtime folder: $CmsHome"
foreach ($dir in @($CmsHome, "$CmsHome\downloads", $LogDir, $RunDir, "$CmsHome\uploads")) { New-Item -ItemType Directory -Force $dir | Out-Null }

foreach ($d in $Downloads) {
    Write-Step $d.Name
    if (Test-Path (Join-Path $CmsHome $d.Check)) { Write-Ok 'already installed'; continue }
    $zip = Join-Path "$CmsHome\downloads" ([IO.Path]::GetFileName($d.Url))
    if (-not (Test-Path $zip)) {
        & curl.exe -L --fail --silent --show-error -o $zip $d.Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($d.Url)" }
    }
    $hash = (Get-FileHash $zip -Algorithm SHA256).Hash
    if ($hash -ne $d.Sha256) { Remove-Item $zip -Force; throw "Checksum mismatch for $($d.Name); the download was deleted. Expected $($d.Sha256), got $hash." }
    Write-Ok 'checksum verified'
    $target = $CmsHome
    if ($d.ContainsKey('Into')) { $target = Join-Path $CmsHome $d.Into; New-Item -ItemType Directory -Force $target | Out-Null }
    & tar.exe -x -f $zip -C $target
    if ($LASTEXITCODE -ne 0) { throw "Could not extract $zip" }
    if ($d.ContainsKey('Rename')) { Rename-Item (Join-Path $CmsHome $d.Rename) $d.Folder }
    Write-Ok "installed to $CmsHome\$($d.Folder)"
}

Write-Step 'Secrets (cms/.env)'
& $Node22 (Join-Path $CmsDir 'scripts\init-env.mjs')
$cmsEnv = Read-CmsEnv

Write-Step 'Directus 12.5 (cms/server)'
if (Test-Path (Join-Path $ServerDir 'node_modules\directus')) {
    Write-Ok 'already installed'
} else {
    $env:PATH = "$(Split-Path $Node22);$env:PATH"   # this session only, so install scripts use Node 22
    Push-Location $ServerDir
    try { & $Node22 $Npm22 ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } } finally { Pop-Location }
    Write-Ok 'installed from package-lock.json'
}

Write-Step 'PostgreSQL database cluster'
if (Test-Path (Join-Path $PgData 'PG_VERSION')) {
    Write-Ok "already initialised at $PgData"
} else {
    $pwFile = Join-Path $RunDir 'initdb.pw'
    [IO.File]::WriteAllText($pwFile, $cmsEnv['DB_PASSWORD'])
    try {
        & (Join-Path $PgBin 'initdb.exe') -D $PgData -U directus --pwfile=$pwFile --auth=scram-sha-256 --encoding=UTF8 --no-locale | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
    } finally { Remove-Item $pwFile -Force -ErrorAction SilentlyContinue }
    Add-Content -Path (Join-Path $PgData 'postgresql.conf') -Encoding ascii -Value @(
        '', '# Bridlington Town AFC local CMS: this computer only',
        "listen_addresses = '127.0.0.1'", "port = $($Ports.PostgreSQL)", "password_encryption = 'scram-sha-256'"
    )
    Write-Ok "initialised at $PgData (password login, 127.0.0.1:$($Ports.PostgreSQL) only)"
}

Write-Host "`nSetup complete. Start the CMS with cms\scripts\windows\start-cms.ps1" -ForegroundColor Green
