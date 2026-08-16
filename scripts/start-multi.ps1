#requires -Version 5.1
<#
.SYNOPSIS
  启动多个 DSH web 实例 + 多窗口墙（dsh-multi-wall）。

.DESCRIPTION
  依次启动 `dsh web --port <n>`（默认 3080..3083 共 4 个实例），再启动 wall
  服务器（默认 :3999），最后在默认浏览器打开墙页面。所有子进程 PID 记录到
  状态文件，供 stop-multi.ps1 一键停止。

.PARAMETER Ports
  逗号分隔的端口列表，例如 -Ports "3080,3081,3082,3084"。
  默认 "3080,3081,3082,3083"。

.PARAMETER WallPort
  wall 服务器端口，默认 3999。

.PARAMETER ScanRange
  wall 自动发现扫描的端口区间，默认 "3070-3110"。

.PARAMETER NoOpen
  不自动打开浏览器。

.EXAMPLE
  .\start-multi.ps1 -Ports "3080,3081,3082,3084"
  .\start-multi.ps1 -Ports "3080,3081" -WallPort 4000 -NoOpen
#>
param(
    [string]$Ports = "3080,3081,3082,3083",
    [int]$WallPort = 3999,
    [string]$ScanRange = "3070-3110",
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root ".wall-pids.json"
$serverJs = Join-Path $root "wall\server.mjs"

# 1) 解析端口列表
$portList = @($Ports -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' })
if ($portList.Count -eq 0) { throw "没有有效的端口列表：$Ports" }

# 2) 检查 dsh 是否可用
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
if (-not $dsh) { throw "未找到 dsh 命令，请先安装 @deepseek-ai/dsh（npm i -g @deepseek-ai/dsh）" }

# 3) 启动每个 dsh web 实例
$pids = @()
$started = @()
foreach ($p in $portList) {
    $proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList @($dsh.Source, "web", "--port", $p) -PassThru -WindowStyle Hidden
    $pids += $proc.Id
    $started += $p
    Write-Host "dsh web --port $p  (pid $($proc.Id))"
    Start-Sleep -Milliseconds 800
}

# 4) 启动 wall 服务器
$wall = Start-Process -FilePath (Get-Command node).Source -ArgumentList @($serverJs, "--port", $WallPort, "--scan", $ScanRange) -PassThru -WindowStyle Hidden
$pids += $wall.Id
Write-Host "wall server :$WallPort  (pid $($wall.Id))  http://127.0.0.1:$WallPort"

# 5) 记录 PID 状态
@{ pid = $pids; ports = $started; wallPort = $WallPort; startedAt = (Get-Date).ToString("o") } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8
Write-Host "状态已保存到 $stateFile"

# 6) 打开浏览器
if (-not $NoOpen) {
    Start-Process "http://127.0.0.1:$WallPort"
}
Write-Host "完成：$($started -join ', ') + wall :$WallPort"
