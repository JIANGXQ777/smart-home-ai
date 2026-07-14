$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendUri = "http://localhost:5000/"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$backendStartupTimeoutSeconds = 20
$backendHost = "127.0.0.1"
$backendPort = 5000

function Stop-BackendProcesses {
    $escapedProjectRoot = [Regex]::Escape($projectRoot)

    $nodeProcesses = Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -eq 'node.exe' -and
            $_.CommandLine -match 'backend[\\/]server\.js' -and
            $_.CommandLine -match $escapedProjectRoot
        }

    foreach ($process in $nodeProcesses) {
        Write-Host "Stopping backend node process: $($process.ProcessId)" -ForegroundColor Yellow
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 500
}

function Wait-ForBackend {
    param(
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if (Test-Backend) {
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Test-Backend {
    $client = $null

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $client.BeginConnect($backendHost, $backendPort, $null, $null)
        $connected = $asyncResult.AsyncWaitHandle.WaitOne(2000, $false)

        return $connected -and $client.Connected
    } catch {
        return $false
    } finally {
        if ($client) {
            $client.Close()
        }
    }
}

Write-Host ""
Write-Host "Smart Home AI launcher" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"

Stop-BackendProcesses

Write-Host "Starting backend..." -ForegroundColor Yellow
Start-Process node -ArgumentList "backend/server.js" -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
$backendRunning = Wait-ForBackend -TimeoutSeconds $backendStartupTimeoutSeconds

if ($backendRunning) {
    Write-Host "Backend is ready." -ForegroundColor Green
} else {
    Write-Warning "Backend did not become ready in time. Opening frontend anyway."
}

Write-Host "Opening frontend..." -ForegroundColor Yellow
try {
    if (Test-Path $edgePath) {
        Start-Process $edgePath -ArgumentList $frontendUri | Out-Null
    } else {
        Start-Process $frontendUri | Out-Null
    }
} catch {
    throw
}

Write-Host "Done." -ForegroundColor Green
