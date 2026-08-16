# gateway-stop.ps1 — stop the authenticated gateway (finds the node process
# listening on the gateway port and terminates it).
#
# Usage:
#   .\scripts\gateway-stop.ps1           # default port 8443
#   .\scripts\gateway-stop.ps1 -Port 8443

param(
    [int]$Port = 8443
)

$ErrorActionPreference = 'Stop'

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
    Write-Host "端口 $Port 上没有正在监听的网关进程。"
    exit 0
}

$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $pids) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $pid -Force
        Write-Host "已停止网关进程 (PID $pid, $($proc.ProcessName))。"
    }
}

Start-Sleep -Milliseconds 300
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Warning "端口 $Port 仍有监听，可能未完全停止。"
} else {
    Write-Host "端口 $Port 已释放。"
}
