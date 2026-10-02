# Run with PowerShell; connection to the live server is read-only.
param([string]$SiteUrl = 'http://127.0.0.1:25500', [string]$SshFixture)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Tokens = $null
$ParseErrors = $null
$null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $Root 'Connect-Remote-Windows.ps1'), [ref]$Tokens, [ref]$ParseErrors)
if ($ParseErrors.Count) { throw ($ParseErrors | Out-String) }
. (Join-Path $Root 'Connect-Remote-Windows.ps1')
$OldProxy = [Net.WebRequest]::DefaultWebProxy
try {
    [Net.WebRequest]::DefaultWebProxy = New-Object Net.WebProxy('http://127.0.0.1:1', $false)
    $Health = Get-QingcaiHealth $SiteUrl
    if (-not $Health -or -not $Health.llm.loaded) { throw 'Health check failed with a broken default proxy.' }
    Test-QingcaiSite $SiteUrl
    if (Get-QingcaiHealth 'http://127.0.0.1:1') { throw 'A dead endpoint was accepted.' }
    $Rejected = $false
    try { $null = Get-DirectContent "$SiteUrl/not-a-real-page" } catch { $Rejected = $true }
    if (-not $Rejected) { throw 'A 404 response was accepted.' }
    Write-Output 'PASS: parser, direct HTTP with broken default proxy, homepage, five assets, both APIs, dead endpoint, HTTP 404.'
} finally { [Net.WebRequest]::DefaultWebProxy = $OldProxy }
if ($SshFixture) {
    $OutConfig = Join-Path ([IO.Path]::GetTempPath()) ('qingcai-config-test-' + [guid]::NewGuid().ToString('N'))
    try {
        if (-not (New-QingcaiSshConfig $SshFixture 'qingcai-test' $OutConfig)) { throw 'Config generation failed.' }
        $Raw = Get-Content -LiteralPath $OutConfig -Raw
        if ($Raw -match '(?m)^(localforward|remoteforward|dynamicforward|remotecommand|localcommand|forkafterauthentication|controlmaster)\s') {
            throw 'Inherited forwarding/session options were retained.'
        }
        if ($Raw -notmatch 'hostname example.invalid' -or $Raw -notmatch 'user qingcai-test') { throw 'Login destination changed.' }
        if ($Raw -notmatch 'identityfile "/tmp/qingcai identity"') { throw 'Identity path with spaces was not preserved.' }
        if ($Raw -notmatch 'stricthostkeychecking true|stricthostkeychecking yes') { throw 'Host verification was changed.' }
        Write-Output 'PASS: SSH config parses, forwarding removed, destination/user/identity/host verification preserved.'
    } finally {
        Remove-Item -LiteralPath $OutConfig, "$OutConfig.errors" -Force -ErrorAction SilentlyContinue
    }
}
