$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\diagnose_sync.ps1')

$checks = 0
function Assert-DiagnosticCheck {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    $script:checks++
}
function New-CommandResult {
    param([string]$Text, [int]$Code = 0)
    return [pscustomobject]@{ Text = $Text; ExitCode = $Code }
}

foreach ($valid in @('10.42.0.10', '10.42.1.20', '172.16.0.1', '192.168.1.3')) {
    Assert-DiagnosticCheck (Test-PrivateIpv4 $valid) "Private IPv4 rejected: $valid"
}
foreach ($invalid in @('127.0.0.1', '8.8.8.8', '::1', '10.1', '010.0.0.1', '10.1.2.999', '10.1.2.3/16', '10.1.2.3 -p 80', '172.32.0.1')) {
    Assert-DiagnosticCheck (-not (Test-PrivateIpv4 $invalid)) "Invalid target accepted: $invalid"
}
Assert-DiagnosticCheck (Test-PktMonIdle (New-CommandResult 'Packet monitor is not running.')) 'English idle state rejected.'
$chineseIdle = [regex]::Unescape('\u6570\u636e\u5305\u76d1\u89c6\u5668\u6ca1\u6709\u8fd0\u884c\u3002')
Assert-DiagnosticCheck (Test-PktMonIdle (New-CommandResult $chineseIdle 1)) 'Installed Chinese idle state rejected.'
foreach ($unknown in @('Access is denied.', 'Packet capture is running.', 'Unknown output.', "Packet monitor is not running.`nError: denied")) {
    Assert-DiagnosticCheck (-not (Test-PktMonIdle (New-CommandResult $unknown 1))) 'Unknown status treated as idle.'
}
Assert-DiagnosticCheck (Test-NoPktMonFilters (New-CommandResult 'No packet filters were specified.')) 'English empty filters rejected.'
$chineseEmpty = [regex]::Unescape('\u672a\u6307\u5b9a\u6570\u636e\u5305\u7b5b\u9009\u5668\u3002')
Assert-DiagnosticCheck (Test-NoPktMonFilters (New-CommandResult $chineseEmpty)) 'Installed Chinese empty filters rejected.'
Assert-DiagnosticCheck (-not (Test-NoPktMonFilters (New-CommandResult $chineseEmpty 1))) 'A failed query was accepted.'
Assert-DiagnosticCheck (-not (Test-NoPktMonFilters (New-CommandResult 'Unknown output'))) 'Unknown filters treated as empty.'

$filter = 'WordspaceDiag-a12b34'
$row = "  1 $filter IPv4 TCP 10.42.0.10 10.42.1.20 4174"
Assert-DiagnosticCheck (Test-OwnPktMonFilter (New-CommandResult "# Name Protocol IP Port`n$row") $filter '10.42.0.10' '10.42.1.20') 'Own-only filter was rejected.'
foreach ($unsafeRows in @("$row`n  2 other TCP 443", $row.Replace($filter, "$filter-other"), $row.Replace('4174', '41740'), $row.Replace('10.42.0.10', '10.42.0.100'), $row.Replace('10.42.0.10', '10.42.0.10/16'), $row.Replace('TCP', 'UDP'), '')) {
    Assert-DiagnosticCheck (-not (Test-OwnPktMonFilter (New-CommandResult $unsafeRows) $filter '10.42.0.10' '10.42.1.20')) 'Unknown/broadened filter could be cleared.'
}
$etl = 'C:\wordspace-example\outputs\unique\metadata.etl'
Assert-DiagnosticCheck (Test-OwnPktMonSession (New-CommandResult "Packet capture`nLog file: $etl") $etl) 'Own session rejected.'
Assert-DiagnosticCheck (-not (Test-OwnPktMonSession (New-CommandResult 'Log file: C:\other.etl') $etl)) 'Another session could be stopped.'
Assert-DiagnosticCheck (-not (Test-OwnPktMonSession (New-CommandResult "Log file: $etl" 1) $etl)) 'Failed status query was accepted.'
$captureArgs = @(Get-SyncCaptureArguments $etl)
$flags = [Convert]::ToInt32($captureArgs[$captureArgs.IndexOf('--flags') + 1], 16)
Assert-DiagnosticCheck (($flags -band 0x010) -eq 0) 'Raw packet bytes must not be recorded.'
Assert-DiagnosticCheck (($flags -band 0x002) -ne 0) 'Summary metadata must be recorded.'
Assert-DiagnosticCheck ($captureArgs[$captureArgs.IndexOf('--file-size') + 1] -eq '8') 'Capture file limit changed.'
Assert-DiagnosticCheck ($captureArgs[$captureArgs.IndexOf('--log-mode') + 1] -eq 'circular') 'Capture could create unbounded files.'
Assert-DiagnosticCheck (-not ($captureArgs -contains '--trace')) 'Unrelated event providers could be captured.'
Assert-DiagnosticCheck ($script:CaptureSeconds -eq 30) 'Capture duration changed.'
Write-Output "PASS: $checks non-privileged diagnostic safety checks."
