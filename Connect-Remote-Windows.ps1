# Windows PowerShell 5.1 compatible. No administrator rights required.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_][A-Za-z0-9_.@-]*$')][string]$RemoteHostAlias = 'hft',
    [ValidateRange(1024, 65535)][int]$LocalPort = 25501,
    [switch]$Install
)

$ErrorActionPreference = 'Stop'

function Get-DirectContent([string]$Url) {
    # Invoke-RestMethod in Windows PowerShell can inherit a system proxy.
    $Request = [System.Net.HttpWebRequest]::Create($Url)
    $Request.Proxy = $null
    $Request.Timeout = 5000
    $Request.ReadWriteTimeout = 5000
    $Request.AllowAutoRedirect = $false
    $Response = $Request.GetResponse()
    try {
        if ([int]$Response.StatusCode -ne 200) { throw "HTTP $([int]$Response.StatusCode): $Url" }
        $Reader = New-Object System.IO.StreamReader($Response.GetResponseStream(), [Text.Encoding]::UTF8)
        try { return $Reader.ReadToEnd() } finally { $Reader.Dispose() }
    } finally { $Response.Close() }
}

function Get-QingcaiHealth([string]$Url) {
    try {
        $Health = Get-DirectContent "$Url/api/book/health" | ConvertFrom-Json
        if ($Health.service -eq 'bookkeeper' -and $Health.dataset.version -eq 'accounting-v2') {
            return $Health
        }
    } catch { }
    return $null
}

function Test-QingcaiSite([string]$Url) {
    $HomePage = Get-DirectContent "$Url/"
    if ($HomePage -notmatch 'id="app"' -or $HomePage -notmatch 'app.js') {
        throw 'The port did not return the Qingcai frontend.'
    }
    foreach ($Asset in @('app.js', 'api.js', 'app.css', 'tokens.css', 'runtime-config.js')) {
        $Content = Get-DirectContent "$Url/$Asset"
        if ([string]::IsNullOrWhiteSpace($Content)) { throw "Empty frontend resource: $Asset" }
    }
    $Trader = Get-DirectContent "$Url/api/trader/health" | ConvertFrom-Json
    if ($Trader.status -ne 'ok') { throw 'The investment API is not ready.' }
}

function Find-QingcaiBrowser {
    $Candidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($Candidate in $Candidates) {
        if (Test-Path -LiteralPath $Candidate -PathType Leaf) { return $Candidate }
    }
    throw 'Microsoft Edge or Google Chrome was not found in its standard installation directory.'
}

function New-QingcaiSshConfig([string]$SshExe, [string]$AliasName, [string]$ConfigPath) {
    $Effective = @(& $SshExe -G -T $AliasName 2> "$ConfigPath.errors")
    if ($LASTEXITCODE -ne 0) { throw "Cannot resolve SSH alias $AliasName. See $ConfigPath.errors" }
    # A ProxyJump alias needs the original file's other Host blocks.
    # Preserve that setup, instead of silently breaking access through a bastion.
    if ($Effective -match '^proxyjump\s+(?!none$)') {
        Write-Host 'ProxyJump detected; preserving original SSH configuration.'
        return $false
    }
    $Omit = '^(localforward|remoteforward|dynamicforward|clearallforwardings|exitonforwardfailure|controlmaster|controlpath|controlpersist|forkafterauthentication|remotecommand|sessiontype|requesttty|localcommand|permitlocalcommand)\s'
    $Clean = @($Effective | Where-Object { $_ -notmatch $Omit })
    # ssh -G emits path-valued settings without quotes. Restore quotes for spaces.
    $PathKeys = '^(identityfile|certificatefile|identityagent|securitykeyprovider|pkcs11provider|revokedhostkeys)\s+(.+)$'
    $Clean = @($Clean | ForEach-Object {
        if ($_ -match $PathKeys -and [regex]::IsMatch($Matches[2], '\s')) {
            $Matches[1] + ' "' + $Matches[2].Replace('"', '\"') + '"'
        } else { $_ }
    })
    [IO.File]::WriteAllLines($ConfigPath, [string[]]$Clean, (New-Object Text.UTF8Encoding($false)))
    $null = & $SshExe -G -T -F $ConfigPath $AliasName 2> "$ConfigPath.errors"
    if ($LASTEXITCODE -ne 0) { throw "Generated SSH configuration is invalid. See $ConfigPath.errors" }
    return $true
}

function Start-Qingcai {
    if ($env:OS -ne 'Windows_NT') { throw 'Run this launcher on your Windows computer, not on the Linux server.' }
    $AppDir = Join-Path $env:LOCALAPPDATA 'Qingcai'
    $null = New-Item -ItemType Directory -Path $AppDir -Force
    if ($Install) {
        $InstalledScript = Join-Path $AppDir 'Connect-Remote-Windows.ps1'
        if ($PSCommandPath -ne $InstalledScript) { Copy-Item -LiteralPath $PSCommandPath -Destination $InstalledScript -Force }
        $Shell = New-Object -ComObject WScript.Shell
        $Desktop = [Environment]::GetFolderPath('Desktop')
        $Shortcut = $Shell.CreateShortcut((Join-Path $Desktop 'Qingcai.lnk'))
        $Shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
        $Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $InstalledScript + '" -RemoteHostAlias ' + $RemoteHostAlias + ' -LocalPort ' + $LocalPort
        $Shortcut.WorkingDirectory = $AppDir
        $Shortcut.Description = 'Qingcai - connect and open the remote website'
        $Shortcut.Save()
        Write-Host "Desktop shortcut installed: $Desktop\Qingcai.lnk"
    }
    $SiteUrl = "http://127.0.0.1:$LocalPort"
    $BrowserExe = Find-QingcaiBrowser
    $SshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
    $SessionDir = Join-Path $AppDir ('session-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $SessionDir
    $TranscriptPath = Join-Path $SessionDir 'connection.log'
    $null = Start-Transcript -Path $TranscriptPath
    $TunnelProcess = $null
    try {
        $ConfigPath = Join-Path $SessionDir 'ssh.conf'
        $TunnelLog = Join-Path $SessionDir 'ssh.log'
        $ProfileDir = Join-Path $SessionDir 'browser'
        $ConfigReady = $false
        $UseCleanConfig = $false
        $Opened = $false
        $Attempts = 0
        Write-Host "Website: $SiteUrl"
        Write-Host "Diagnostic files: $SessionDir"
        Write-Host 'Keep this connection window open. Close it to stop automatic reconnection.'
        while ($true) {
            $Health = Get-QingcaiHealth $SiteUrl
            if (-not $Health) {
                $Probe = New-Object Net.Sockets.TcpClient
                try {
                    $Probe.Connect('127.0.0.1', $LocalPort)
                    throw "Port $LocalPort is listening, but the Qingcai API is unavailable. No existing process was stopped. See $TranscriptPath"
                } catch [Net.Sockets.SocketException] {
                    # No listener: start our own dedicated SSH connection.
                } finally { $Probe.Dispose() }
                if ($TunnelProcess) {
                    $TunnelProcess.Refresh()
                    if (-not $TunnelProcess.HasExited) { Stop-Process -Id $TunnelProcess.Id }
                    $TunnelProcess = $null
                }
                if ($Attempts -ge 3) { throw 'SSH could not restore access after three attempts. Check ssh.log in the diagnostic folder.' }
                $Attempts++
                if (-not $ConfigReady) {
                    $UseCleanConfig = New-QingcaiSshConfig $SshExe $RemoteHostAlias $ConfigPath
                    $ConfigReady = $true
                }
                $SshArgs = @('-v', '-E', ('"' + $TunnelLog + '"'), '-N', '-T',
                    '-o', 'ControlMaster=no', '-o', 'ControlPath=none',
                    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
                    '-o', 'ConnectTimeout=15')
                if ($UseCleanConfig) { $SshArgs += @('-F', ('"' + $ConfigPath + '"'), '-o', 'ExitOnForwardFailure=yes') }
                else { $SshArgs += @('-o', 'ExitOnForwardFailure=no') }
                $SshArgs += @('-L', "127.0.0.1:${LocalPort}:127.0.0.1:25500", $RemoteHostAlias)
                Write-Host 'Connecting. If requested, authenticate in the new SSH window.'
                $TunnelProcess = Start-Process -FilePath $SshExe -ArgumentList $SshArgs -PassThru
                $Deadline = (Get-Date).AddSeconds(90)
                do {
                    Start-Sleep -Milliseconds 750
                    $Health = Get-QingcaiHealth $SiteUrl
                    if ($Health) { break }
                    $TunnelProcess.Refresh()
                    if ($TunnelProcess.HasExited) { break }
                } while ((Get-Date) -lt $Deadline)
                if (-not $Health) {
                    if (-not $TunnelProcess.HasExited) { throw 'SSH did not reach the API within 90 seconds. Check the SSH window and diagnostic log.' }
                    Start-Sleep -Seconds 3
                    continue
                }
            }
            $Attempts = 0
            if (-not $Opened) {
                Test-QingcaiSite $SiteUrl
                Write-Host "Homepage, assets and both APIs verified. Bills: $($Health.bill_count); model loaded: $($Health.llm.loaded)"
                # A fresh profile forces a separate process and avoids stale API URLs,
                # extensions, cache and proxy settings in the everyday browser.
                $BrowserArgs = '--user-data-dir="' + $ProfileDir + '" --no-proxy-server --no-first-run --new-window ' + $SiteUrl + '/'
                Start-Process -FilePath $BrowserExe -ArgumentList $BrowserArgs
                $Opened = $true
                Write-Host 'Browser opened. If it still fails, capture its address bar and error code.'
            }
            Start-Sleep -Seconds 5
        }
    } catch {
        Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
        if ($TunnelLog -and (Test-Path -LiteralPath $TunnelLog)) { Get-Content -LiteralPath $TunnelLog -Tail 25 }
        Write-Host "Diagnostic log: $TranscriptPath"
        $null = Read-Host 'Press Enter to close'
        throw
    } finally {
        if ($TunnelProcess) {
            $TunnelProcess.Refresh()
            if (-not $TunnelProcess.HasExited) { Stop-Process -Id $TunnelProcess.Id }
        }
        $null = Stop-Transcript
    }
}

# Dot-sourcing is used by the cross-platform validation script; no Windows actions run.
if ($MyInvocation.InvocationName -ne '.') { Start-Qingcai }
