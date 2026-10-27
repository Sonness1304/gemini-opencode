$ErrorActionPreference = 'Stop'
$goBinary = Join-Path $PSScriptRoot 'Gemini-Web2API-Go.exe'
$goData = Join-Path $env:LOCALAPPDATA 'Jarvis\gemini-web2api-go-pilot'
$goConfig = Join-Path $goData 'config.json'
if ((Get-FileHash -LiteralPath $goBinary -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'b99cd7589e1e0f17052d8777a35b8f590262ab5812aca90479e288fd35105e71') { throw 'Go binary hash mismatch' }
$goValues = Get-Content -LiteralPath $goConfig -Raw | ConvertFrom-Json
if ($goValues.host -ne '127.0.0.1' -or $goValues.port -ne 20831 -or $goValues.db_path -ne (Join-Path $goData 'data\gemini.db')) { throw 'Unexpected Go configuration; existing data left unchanged.' }
$goExisting = @(Get-NetTCPConnection -State Listen -LocalPort 20831 -ErrorAction SilentlyContinue)
if ($goExisting.Count) {
    if ($goExisting.Count -ne 1 -or $goExisting[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected listener; left unchanged.' }
    $goOwner = Get-Process -Id $goExisting[0].OwningProcess
    if ($goOwner.Path -ne $goBinary) { throw 'Port is occupied by another application; left unchanged.' }
    Write-Output "Gemini Go already running: PID $($goOwner.Id)"
    & (Join-Path $PSScriptRoot 'Start-Gemini-Go-Queue.ps1'); & (Join-Path $PSScriptRoot 'Test-Gemini-Session.ps1'); exit 0
}
# Recheck under a launcher-only mutex; it never locks desktop input.
$goMutex = [Threading.Mutex]::new($false, 'Local\JarvisGeminiGo20831')
$goHeld = $false
try {
    try { $goHeld = $goMutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $goHeld = $true }
    if (-not $goHeld) { throw 'Another Go launcher is still starting.' }
    if (Get-NetTCPConnection -State Listen -LocalPort 20831 -ErrorAction SilentlyContinue) { throw 'Go started while waiting; use the existing instance.' }
    $goProcess = Start-Process -FilePath $goBinary -ArgumentList @('--config', $goConfig) -WorkingDirectory $goData -WindowStyle Hidden -RedirectStandardOutput (Join-Path $goData 'stdout.log') -RedirectStandardError (Join-Path $goData 'stderr.log') -PassThru
    $goProcess.Id | Set-Content -LiteralPath (Join-Path $goData 'pid.txt')
    $goDeadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $goReady = @(Get-NetTCPConnection -State Listen -LocalPort 20831 -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.OwningProcess -eq $goProcess.Id })
        if ($goReady.Count -eq 1) { Write-Output "Gemini Go started: PID $($goProcess.Id)"; & (Join-Path $PSScriptRoot 'Start-Gemini-Go-Queue.ps1'); & (Join-Path $PSScriptRoot 'Test-Gemini-Session.ps1'); exit 0 }
        if ($goProcess.HasExited) { throw 'Go exited before listening; inspect its logs.' }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $goDeadline)
    throw 'Go startup not confirmed; inspect before starting again.'
} finally {
    if ($goHeld) { $goMutex.ReleaseMutex() }
    $goMutex.Dispose()
}
