# Shows whether each local CMS service is running and confirms it is bound to 127.0.0.1 only.
#   powershell -NoProfile -ExecutionPolicy Bypass -File cms\scripts\windows\status-cms.ps1
. "$PSScriptRoot\CmsCommon.ps1"

foreach ($name in $Ports.Keys) {
    $port = $Ports[$name]
    $listeners = Get-Listeners $port
    if ($listeners.Count -eq 0) { Write-Host ("{0,-13} stopped" -f $name); continue }
    $addresses = ($listeners | ForEach-Object { "$($_.LocalAddress):$port" } | Sort-Object -Unique) -join ', '
    $local = @($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }).Count -eq 0
    if ($local) { Write-Host ("{0,-13} running on {1} (this computer only)" -f $name, $addresses) -ForegroundColor Green }
    else { Write-Host ("{0,-13} running on {1} - EXPOSED TO THE NETWORK" -f $name, $addresses) -ForegroundColor Red }
}
$node = Get-ProjectNode
foreach ($name in $WebsiteServices.Keys) {
    $process = Get-TrackedProcess $name $node
    if (-not $process) { $process = Find-ScriptProcess $WebsiteServices[$name].Script }
    if ($process) { Write-Host ("{0,-25} running (process {1})" -f $WebsiteServices[$name].Title, $process.Id) -ForegroundColor Green }
    else { Write-Host ("{0,-25} stopped" -f $WebsiteServices[$name].Title) }
}
if (Wait-HttpOk "http://127.0.0.1:$($Ports.Directus)/server/ping" 2) { Write-Host "`nDashboard: http://localhost:$($Ports.Directus)/admin" }
