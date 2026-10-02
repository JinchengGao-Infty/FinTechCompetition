$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot '.runtime\launcher.pid'
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host 'No recorded background launcher.'
    exit 0
}
$launcherId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
$launcher = Get-CimInstance Win32_Process -Filter "ProcessId = $launcherId"
if (-not $launcher) {
    Write-Host 'Background launcher has already stopped.'
    exit 0
}
$expectedScript = Join-Path $PSScriptRoot 'run.py'
if ($launcher.Name -ne 'python.exe' -or -not $launcher.CommandLine.Contains($expectedScript)) {
    throw 'Recorded PID no longer belongs to this project; no process was stopped.'
}
& taskkill.exe /PID $launcherId /T /F
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the project process tree.' }
Remove-Item -LiteralPath $pidFile
Write-Host 'Project background services stopped.'
