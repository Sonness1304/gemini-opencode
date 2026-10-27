$ErrorActionPreference = 'Stop'
# Authentication refresh remains owned by Go and the user's browser session.
# No password, browser database or credential export is read by this launcher.
$sessionStatus = 'BRIDGE_REQUIRED'
try {
    $sessionKey = (Invoke-RestMethod 'http://127.0.0.1:20831/admin/api/apikey' -TimeoutSec 3).key
    if (-not $sessionKey) { throw 'Admin login required' }
    $headers = @{ Authorization = "Bearer $sessionKey" }
    $bindings = (Invoke-RestMethod 'http://127.0.0.1:20831/admin/api/jarvis/session' -Headers $headers -TimeoutSec 3).items
    if (@($bindings).Count -eq 2) {
        $sessionStatus = 'READY'
        foreach ($item in $bindings) {
            if ($item.status -ne 'enabled') { $sessionStatus = 'LOGIN_OR_ENABLE_REQUIRED'; continue }
            $result = Invoke-RestMethod ("http://127.0.0.1:20831/admin/api/cookies/{0}/check" -f [long]$item.id) -Method Post -TimeoutSec 6
            if (-not $result.ok) { $sessionStatus = 'LOGIN_REQUIRED' }
        }
    }
} catch { $sessionStatus = 'CHECK_UNCONFIRMED' }
finally { $sessionKey = $null; $headers = $null }
$statusPath = Join-Path $env:LOCALAPPDATA 'Jarvis\gemini-web2api-go-pilot\session-status.txt'
$sessionStatus | Set-Content -LiteralPath $statusPath -Encoding utf8
Write-Output "Gemini session: $sessionStatus"
# A failed session check must still allow the user to open the admin page.
