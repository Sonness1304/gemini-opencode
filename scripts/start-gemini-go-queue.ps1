$ErrorActionPreference = 'Stop'
$queueScript = Join-Path $PSScriptRoot 'gemini-go-queue.mjs'
$queueData = Join-Path $env:LOCALAPPDATA 'Jarvis\gemini-web2api-go-pilot'
$nodeBinary = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $queueScript -PathType Leaf)) { throw 'Gemini queue script missing.' }
$goListeners = @(Get-NetTCPConnection -State Listen -LocalPort 20831 -ErrorAction SilentlyContinue)
if ($goListeners.Count -ne 1 -or $goListeners[0].LocalAddress -ne '127.0.0.1' -or
    (Get-Process -Id $goListeners[0].OwningProcess).Path -ne (Join-Path $PSScriptRoot 'Gemini-Web2API-Go.exe')) { throw 'Expected Gemini Go is not running.' }
$queueMutex = [Threading.Mutex]::new($false, 'Local\JarvisGeminiQueue20832')
$queueHeld = $false
try {
    try { $queueHeld = $queueMutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $queueHeld = $true }
    if (-not $queueHeld) { throw 'Gemini queue startup is busy.' }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 20832 -ErrorAction SilentlyContinue)
    if ($listeners.Count) {
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected queue listener.' }
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
        if ($owner.ExecutablePath -ne $nodeBinary -or -not $owner.CommandLine.Contains('"' + $queueScript + '"')) { throw 'Queue port belongs to another process.' }
    } else {
        $process = Start-Process -FilePath $nodeBinary -ArgumentList @(('"' + $queueScript + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $queueData 'queue-stdout.log') -RedirectStandardError (Join-Path $queueData 'queue-stderr.log') -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        do {
            $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 20832 -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.OwningProcess -eq $process.Id })
            if ($listeners.Count -eq 1) { break }
            if ($process.HasExited) { throw 'Gemini queue exited; inspect queue-stderr.log.' }
            Start-Sleep -Milliseconds 150
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($listeners.Count -ne 1) { throw 'Gemini queue startup not confirmed.' }
    }
    $health = Invoke-RestMethod -Uri ('http://' + '127.0.0.1:20832/health') -TimeoutSec 3
    if ($health.service -ne 'jarvis-gemini-go-queue' -or $health.concurrency -ne 8) { throw 'Unexpected queue health response.' }
    Write-Output "Gemini queue ready: PID $($listeners[0].OwningProcess), concurrency 8"
} finally {
    if ($queueHeld) { $queueMutex.ReleaseMutex() }
    $queueMutex.Dispose()
}
