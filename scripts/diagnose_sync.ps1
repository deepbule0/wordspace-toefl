[CmdletBinding()]
param(
    [string]$PhoneIp = '',
    [string]$ComputerIp = '',
    [switch]$PreflightOnly
)

# ASCII source keeps this script compatible with Windows PowerShell 5.1.
# No firewall, VPN, route, execution-policy or application-data changes.
$script:SyncPort = 4174
$script:CaptureSeconds = 30
$script:PktMonPath = Join-Path $env:SystemRoot 'System32\pktmon.exe'

function Test-PrivateIpv4 {
    param([string]$Value)
    $parsed = $null
    if ($Value -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or
        -not [Net.IPAddress]::TryParse($Value, [ref]$parsed) -or
        $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
        $parsed.ToString() -cne $Value) { return $false }
    $bytes = $parsed.GetAddressBytes()
    return ($bytes[0] -eq 10 -or
        ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
        ($bytes[0] -eq 192 -and $bytes[1] -eq 168))
}

function Test-PktMonIdle {
    param($Result)
    # Unknown / access-denied output is never treated as an idle monitor.
    return ($Result.ExitCode -in @(0, 1) -and $Result.Text.Trim() -match
        '^(?:Packet monitor is not running\.?|\u6570\u636e\u5305\u76d1\u89c6\u5668\u6ca1\u6709\u8fd0\u884c[\u3002.]?)$')
}

function Test-NoPktMonFilters {
    param($Result)
    return ($Result.ExitCode -eq 0 -and $Result.Text.Trim() -match
        '^(?:No packet filters (?:were specified|specified|are configured)\.?|\u672a\u6307\u5b9a\u6570\u636e\u5305\u7b5b\u9009\u5668[\u3002.]?)$')
}

function Test-OwnPktMonFilter {
    param($Result, [string]$FilterName, [string]$Phone, [string]$Computer)
    if ($Result.ExitCode -ne 0) { return $false }
    $rows = @($Result.Text -split '\r?\n' | Where-Object { $_ -match '^\s*\d+\s+' })
    if ($rows.Count -ne 1) { return $false }
    $row = $rows[0]
    foreach ($token in @($FilterName, $Phone, $Computer, 'TCP', '4174')) {
        if ($row -notmatch ('(?<![\w./-])' + [regex]::Escape($token) + '(?![\w./-])')) {
            return $false
        }
    }
    return $true
}

function Test-OwnPktMonSession {
    param($Result, [string]$EtlPath)
    if ($Result.ExitCode -ne 0 -or (Test-PktMonIdle $Result)) { return $false }
    # Do not stop a new session someone else started during this diagnosis.
    return $Result.Text.IndexOf($EtlPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-SyncCaptureArguments {
    param([string]$EtlPath)
    # 0x02E = summary + packet metadata + NDIS metadata + registrations.
    # Crucially, bit 0x010 (raw packet bytes) is OFF: no HTTP/sync payload.
    return @('start', '--capture', '--comp', 'all', '--flags', '0x02E',
        '--pkt-size', '54', '--file-name', $EtlPath,
        '--file-size', '8', '--log-mode', 'circular')
}

function Invoke-PktMonCommand {
    param([string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $script:PktMonPath @Arguments 2>&1 | Out-String
        $code = $LASTEXITCODE
        return [pscustomobject]@{ ExitCode = $code; Text = $output }
    } finally { $ErrorActionPreference = $previousPreference }
}

function Get-RouteSummary {
    param([string]$RemoteIp, [string]$SourceIp)
    try {
        $argsForRoute = @{ RemoteIPAddress = $RemoteIp; ErrorAction = 'Stop' }
        if ($SourceIp) { $argsForRoute.LocalIPAddress = $SourceIp }
        return @(Find-NetRoute @argsForRoute | Select-Object InterfaceAlias,
            InterfaceIndex, IPAddress, DestinationPrefix, NextHop, RouteMetric)
    } catch { return [pscustomobject]@{ Available = $false } }
}

function Test-LocalSyncService {
    param([string]$Ip)
    $response = $null
    $reader = $null
    try {
        $request = [Net.HttpWebRequest]::Create("http://${Ip}:4174/hello")
        $request.Proxy = $null
        $request.AllowAutoRedirect = $false
        $request.Timeout = 2500
        $request.ReadWriteTimeout = 2500
        $response = $request.GetResponse()
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        $buffer = New-Object char[] 4097
        $count = $reader.ReadBlock($buffer, 0, $buffer.Length)
        if ([int]$response.StatusCode -ne 200 -or $count -gt 4096) {
            return [pscustomobject]@{ Ready = $false; Result = 'unexpected-response' }
        }
        $body = (-join $buffer[0..($count - 1)]) | ConvertFrom-Json -ErrorAction Stop
        # Persist only the expected public service/version, never the hub ID/body.
        $ready = $body.service -eq 'wordspace-lan' -and $body.version -eq 1
        return [pscustomobject]@{ Ready = $ready; Result = $(if ($ready) { 'wordspace-lan-v1' } else { 'wrong-service' }) }
    } catch { return [pscustomobject]@{ Ready = $false; Result = 'unavailable' } }
    finally {
        if ($reader) { $reader.Dispose() }
        if ($response) { $response.Close() }
    }
}

function Get-SyncBaseline {
    param([string]$Phone, [string]$Computer)
    if (-not (Test-PrivateIpv4 $Phone) -or -not (Test-PrivateIpv4 $Computer) -or $Phone -eq $Computer) {
        throw 'Expected two different, canonical private IPv4 addresses.'
    }
    $ip = @(Get-NetIPAddress -IPAddress $Computer -AddressFamily IPv4 -ErrorAction Stop)
    if ($ip.Count -ne 1 -or [string]$ip[0].AddressState -ne 'Preferred') {
        throw 'Computer address has changed or is not ready. No capture was started.'
    }
    $adapter = Get-NetAdapter -InterfaceIndex $ip[0].InterfaceIndex -ErrorAction Stop
    if (-not $adapter.HardwareInterface -or [string]$adapter.Status -ne 'Up') {
        throw 'The specified computer address is not on a connected physical adapter.'
    }
    $listeners = @(Get-NetTCPConnection -LocalPort $script:SyncPort -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq $Computer } |
        Select-Object LocalAddress, LocalPort, OwningProcess)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return [ordered]@{
        Time = (Get-Date).ToString('o')
        Administrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        PhoneIp = $Phone
        ComputerIp = $Computer
        Port = $script:SyncPort
        ComputerAdapter = [string]$adapter.Name
        ComputerPrefix = $ip[0].PrefixLength
        Listeners = $listeners
        LocalHello = Test-LocalSyncService $Computer
        DefaultRouteToPhone = Get-RouteSummary $Phone
        SourceBoundRouteToPhone = Get-RouteSummary $Phone $Computer
    }
}

function Invoke-SyncDiagnosis {
    param([string]$Phone, [string]$Computer, [bool]$Preflight)
    $ErrorActionPreference = 'Stop'
    try { $baseline = Get-SyncBaseline $Phone $Computer }
    catch { Write-Host $_.Exception.Message; return 1 }
    if ($Preflight) {
        Write-Host ($baseline | ConvertTo-Json -Depth 6)
        return 0
    }
    if (-not $baseline.Administrator) {
        Write-Host 'Administrator permission is needed for the limited packet-metadata capture.'
        Write-Host 'Right-click the diagnostic .cmd file and choose Run as administrator.'
        Write-Host 'Nothing was captured; no filters or network settings were changed.'
        return 2
    }
    if ($baseline.Listeners.Count -eq 0 -or -not $baseline.LocalHello.Ready) {
        Write-Host 'The local sync service is not ready. Keep the sync-service window open first.'
        return 3
    }
    if (-not (Test-Path -LiteralPath $script:PktMonPath -PathType Leaf)) {
        Write-Host 'Windows Packet Monitor was not found. No capture was started.'
        return 4
    }

    $projectPath = Split-Path -Parent $PSScriptRoot
    $runName = 'sync-diagnostics-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $runPath = Join-Path (Join-Path $projectPath 'outputs') $runName
    New-Item -ItemType Directory -Path $runPath -ErrorAction Stop | Out-Null
    $reportPath = Join-Path $runPath 'report.json'
    $etlPath = Join-Path $runPath 'metadata.etl'
    $filterName = 'WordspaceDiag-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
    $operations = [ordered]@{}
    $warnings = New-Object 'Collections.Generic.List[string]'
    $filterAdded = $false
    $captureStarted = $false
    $captureStopped = $false
    $exitStatus = 0
    $report = [ordered]@{
        Baseline = $baseline
        DurationSeconds = $script:CaptureSeconds
        RawPacketBytesRecorded = $false
        FilterName = $filterName
        Operations = $operations
        Warnings = $warnings
        Status = 'preparing'
    }
    try {
        $operations.InitialStatus = Invoke-PktMonCommand @('status')
        $operations.InitialFilters = Invoke-PktMonCommand @('filter', 'list')
        if (-not (Test-PktMonIdle $operations.InitialStatus)) {
            throw 'Another monitor is running, or its status is unknown. It was left untouched.'
        }
        if (-not (Test-NoPktMonFilters $operations.InitialFilters)) {
            throw 'Existing or unrecognized packet filters were found. They were left untouched.'
        }
        $operations.AddFilter = Invoke-PktMonCommand @('filter', 'add', $filterName,
            '-d', 'IPv4', '-t', 'TCP', '-i', $Phone, $Computer, '-p', '4174')
        if ($operations.AddFilter.ExitCode -ne 0) { throw 'Could not add the limited diagnostic filter.' }
        $filterAdded = $true
        $operations.ActiveFilters = Invoke-PktMonCommand @('filter', 'list')
        if (-not (Test-OwnPktMonFilter $operations.ActiveFilters $filterName $Phone $Computer)) {
            throw 'The filter could not be verified as the only filter. No capture was started.'
        }
        Write-Host "PC: $Computer`:4174   Phone: $Phone"
        Write-Host 'Keep the phone on this Wi-Fi, with its VPN/network settings unchanged.'
        Write-Host 'During the next 30 seconds, tap Check connection in the phone app 2-3 times.'
        Write-Host "You can also open http://${Computer}:4174/hello in the phone browser."
        Write-Host 'Do not start/stop other packet-monitor tasks during this short test.'
        $operations.Start = Invoke-PktMonCommand (Get-SyncCaptureArguments $etlPath)
        if ($operations.Start.ExitCode -ne 0) { throw 'The metadata capture could not be started.' }
        $captureStarted = $true
        $report.CaptureStart = (Get-Date).ToString('o')
        for ($remaining = $script:CaptureSeconds; $remaining -gt 0; $remaining--) {
            if ($remaining % 10 -eq 0) { Write-Host "Capturing metadata... $remaining seconds left." }
            Start-Sleep -Seconds 1
        }
        $report.Status = 'capture-finished'
    } catch {
        $report.Status = 'incomplete'
        $warnings.Add($_.Exception.Message)
        $exitStatus = 1
    } finally {
        if ($captureStarted) {
            $operations.StatusBeforeStop = Invoke-PktMonCommand @('status')
            if (Test-OwnPktMonSession $operations.StatusBeforeStop $etlPath) {
                $operations.Stop = Invoke-PktMonCommand @('stop')
                $captureStopped = $operations.Stop.ExitCode -eq 0
                $report.CaptureEnd = (Get-Date).ToString('o')
                if (-not $captureStopped) { $warnings.Add('Could not stop the diagnostic capture; inspect Packet Monitor manually.'); $exitStatus = 1 }
            } elseif (Test-PktMonIdle $operations.StatusBeforeStop) {
                $captureStopped = $true
                $warnings.Add('The monitor stopped before cleanup; the capture may be incomplete.')
                $exitStatus = 1
            } else {
                $warnings.Add('Session ownership could not be verified. No unknown session was stopped. Inspect Packet Monitor manually.')
                $exitStatus = 1
            }
        }
        if ($filterAdded) {
            $operations.StatusBeforeCleanup = Invoke-PktMonCommand @('status')
            $operations.FiltersBeforeCleanup = Invoke-PktMonCommand @('filter', 'list')
            # This Windows version only supports removing ALL filters. Use it
            # solely when the monitor is idle and its ONLY filter is our own.
            if ((Test-PktMonIdle $operations.StatusBeforeCleanup) -and
                (Test-OwnPktMonFilter $operations.FiltersBeforeCleanup $filterName $Phone $Computer)) {
                $operations.RemoveOwnOnlyFilter = Invoke-PktMonCommand @('filter', 'remove')
                $operations.FiltersAfterCleanup = Invoke-PktMonCommand @('filter', 'list')
                if ($operations.RemoveOwnOnlyFilter.ExitCode -ne 0 -or
                    -not (Test-NoPktMonFilters $operations.FiltersAfterCleanup)) {
                    $warnings.Add('Filter cleanup was not confirmed. No further removal was attempted.')
                    $exitStatus = 1
                }
            } else {
                $warnings.Add('Filter ownership or idle status was not confirmed. Existing filters were preserved; inspect Packet Monitor manually.')
                $exitStatus = 1
            }
        }
        if ($captureStarted -and $captureStopped -and -not (Test-Path -LiteralPath $etlPath -PathType Leaf)) {
            $warnings.Add('No metadata file was produced. The capture could not be verified.')
            $exitStatus = 1
        }
        if ($captureStopped -and (Test-Path -LiteralPath $etlPath -PathType Leaf)) {
            $operations.Convert = Invoke-PktMonCommand @('etl2txt', $etlPath,
                '--out', (Join-Path $runPath 'metadata.txt'), '--verbose', '--no-ethernet')
            if ($operations.Convert.ExitCode -ne 0) { $warnings.Add('Text conversion failed; the ETL file was preserved.'); $exitStatus = 1 }
        }
        if ($exitStatus -ne 0) { $report.Status = 'incomplete' }
        $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    }
    Write-Host "Report saved locally: $reportPath"
    foreach ($warning in $warnings) { Write-Host "WARNING: $warning" }
    if ($exitStatus -eq 0) {
        Write-Host 'Capture completed and the temporary filter was removed.'
        Write-Host 'Tell the assistant the test is complete; it can read this local report.'
    } else {
        Write-Host 'The test is incomplete. Tell the assistant; do not change firewall/VPN settings to retry.'
    }
    return $exitStatus
}

# Dot-sourcing loads only the helpers for non-privileged safety tests.
if ($MyInvocation.InvocationName -ne '.') {
    if ([string]::IsNullOrWhiteSpace($PhoneIp)) { $PhoneIp = Read-Host 'Current phone private IPv4 address' }
    if ([string]::IsNullOrWhiteSpace($ComputerIp)) { $ComputerIp = Read-Host 'Current computer private IPv4 address' }
    exit (Invoke-SyncDiagnosis $PhoneIp $ComputerIp ([bool]$PreflightOnly))
}
