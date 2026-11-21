# Stops the local CMS: Directus, Mailpit, then PostgreSQL (fast shutdown: open
# transactions roll back, committed data is kept). Data and uploads are untouched.
#   powershell -NoProfile -ExecutionPolicy Bypass -File cms\scripts\windows\stop-cms.ps1
. "$PSScriptRoot\CmsCommon.ps1"

foreach ($name in $WebsiteServices.Keys) {
    Write-Step $WebsiteServices[$name].Title
    $node = Get-ProjectNode
    if (-not (Get-TrackedProcess $name $node)) { $found = Find-ScriptProcess $WebsiteServices[$name].Script; if ($found) { Save-TrackedProcess $name $found } }
    Stop-TrackedProcess $name $node
}

Write-Step 'Directus'
Stop-TrackedProcess 'directus' $Node22

Write-Step 'Mailpit'
Stop-TrackedProcess 'mailpit' $MailpitExe

Write-Step 'PostgreSQL'
if (Test-PostgresRunning) {
    if ((Invoke-PgCtl @('stop', '-D', $PgData, '-m', 'fast', '-w', '-t', '60')) -ne 0) { throw "PostgreSQL did not stop cleanly. See $LogDir\postgres.log" }
    Write-Ok 'stopped'
} else {
    Write-Note 'PostgreSQL is not running'
}

$left = @($Ports.Values | Where-Object { (Get-Listeners $_).Count -gt 0 })
if ($left.Count -gt 0) { Write-Warning "Something is still listening on port(s) $($left -join ', '); run status-cms.ps1." }
else { Write-Host "`nCMS stopped. Your content is kept in $PgData and $CmsHome\uploads." -ForegroundColor Green }
