#requires -Version 5.1
<#
.SYNOPSIS
  停止 start-multi.ps1 启动的全部进程（多个 dsh web 实例 + 认证网关）。

.DESCRIPTION
  读取 .wall-pids.json 中的 PID 列表（含 gateways 里的网关 PID），逐个停止；
  结束后删除状态文件。只停止本脚本记录过的进程，不会误杀其它 dsh 实例。

.EXAMPLE
  .\stop-multi.ps1
#>
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root ".wall-pids.json"

if (-not (Test-Path $stateFile)) {
    Write-Host "没有找到状态文件 $stateFile —— 可能尚未通过 start-multi.ps1 启动。"
    exit 0
}

$state = Get-Content $stateFile -Raw | ConvertFrom-Json
$stopped = 0

$gatewayPids = @()
foreach ($g in @($state.gateways)) { $gatewayPids += [int]$g.pid }
foreach ($id in @($state.pid) + $gatewayPids) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        $stopped++
        Write-Host "已停止 pid $id"
    } else {
        Write-Host "pid $id 已不存在，跳过"
    }
}

Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
$ports = @($state.ports) -join ", "
Write-Host "已停止 $stopped 个进程（dsh 实例 $ports + 认证网关）。"
