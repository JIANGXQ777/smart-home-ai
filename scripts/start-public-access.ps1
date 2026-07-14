$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$runtimeDir = Join-Path $projectRoot "artifacts\public-access"
$gatewayScript = Join-Path $PSScriptRoot "public-gateway.js"
$gatewayStdout = Join-Path $runtimeDir "gateway.stdout.log"
$gatewayStderr = Join-Path $runtimeDir "gateway.stderr.log"

function Get-DotEnvValue {
    param([string]$Name)

    $line = Get-Content $envPath -ErrorAction Stop |
        Where-Object { $_ -match "^$([Regex]::Escape($Name))=" } |
        Select-Object -First 1

    if (-not $line) { return "" }
    return ($line -split "=", 2)[1].Trim()
}

function Stop-GatewayProcess {
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -eq "node.exe" -and
            $_.CommandLine -and
            $_.CommandLine -match "scripts[\\/]public-gateway\.js"
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function Wait-ForTcpPort {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $result = $client.BeginConnect($HostName, $Port, $null, $null)
            if ($result.AsyncWaitHandle.WaitOne(1000, $false) -and $client.Connected) {
                return $true
            }
        } catch {
        } finally {
            $client.Close()
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Wait-ForPortAvailable {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
        try {
            $listener.Server.ExclusiveAddressUse = $true
            $listener.Start()
            return $true
        } catch {
        } finally {
            $listener.Stop()
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$defaultRoute = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Where-Object { $_.NextHop -and $_.NextHop -ne "0.0.0.0" } |
    Sort-Object RouteMetric |
    Select-Object -First 1
$lanAddress = ""
if ($defaultRoute) {
    $lanAddress = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $defaultRoute.InterfaceIndex -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "169.254.*" } |
        Select-Object -ExpandProperty IPAddress -First 1
}

$lanPortText = Get-DotEnvValue "LAN_GATEWAY_PORT"
if ($lanPortText) { $lanPort = [int]$lanPortText } else { $lanPort = 5000 }
$lanListenHost = Get-DotEnvValue "LAN_GATEWAY_HOST"
if (-not $lanListenHost) { $lanListenHost = "0.0.0.0" }

$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tailscale) {
    throw "Tailscale CLI is not installed or is not available in PATH."
}

Push-Location $projectRoot
try {
    docker compose up -d --no-build --force-recreate | Out-Host

    Stop-GatewayProcess
    if (-not (Wait-ForPortAvailable -Port $lanPort)) {
        throw "LAN port $lanPort is still occupied."
    }

    Remove-Item $gatewayStdout, $gatewayStderr -Force -ErrorAction SilentlyContinue
    $env:LAN_GATEWAY_HOST = $lanListenHost

    Start-Process -FilePath "node" `
        -ArgumentList $gatewayScript `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $gatewayStdout `
        -RedirectStandardError $gatewayStderr | Out-Null

    if (-not (Wait-ForTcpPort -HostName "127.0.0.1" -Port 5001)) {
        Get-Content $gatewayStderr -ErrorAction SilentlyContinue | Out-Host
        throw "Public gateway did not start."
    }

    if ($lanAddress -and -not (Wait-ForTcpPort -HostName $lanAddress -Port $lanPort)) {
        Get-Content $gatewayStderr -ErrorAction SilentlyContinue | Out-Host
        throw "LAN fallback gateway did not start."
    }

    & $tailscale.Source up --hostname smart-home-ai --unattended --timeout 20s
    if ($LASTEXITCODE -ne 0) {
        throw "Tailscale did not enter the running state."
    }

    & $tailscale.Source funnel --bg --yes 5001 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Tailscale Funnel did not start."
    }

    $tailscaleStatus = (& $tailscale.Source status --json) | ConvertFrom-Json
    $dnsName = ([string]$tailscaleStatus.Self.DNSName).TrimEnd(".")
    if (-not $dnsName) {
        throw "Tailscale did not return a DNS name."
    }

    Write-Host ""
    Write-Host "Public URL: https://$dnsName" -ForegroundColor Green
    if ($lanAddress) {
        Write-Host "LAN URL:    http://$($lanAddress):$lanPort" -ForegroundColor Green
    } else {
        Write-Warning "No active LAN address was found."
    }
} finally {
    Pop-Location
}
