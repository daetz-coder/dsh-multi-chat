#requires -Version 5.1
<#
.SYNOPSIS
  启动多个 DSH web 实例（多窗口墙直接内嵌在官方界面里，无需独立服务器）。

.DESCRIPTION
  依次启动 `dsh web --port <n>`（默认 3080..3083 共 4 个实例）。每个实例的
  侧边栏底部都有「多窗口墙」按钮（安装 plugin/dsh-client-ui-multi-wall 后），
  点击即可在官方界面内看到所有实例并排显示。所有子进程 PID 记录到状态文件，
  供 stop-multi.ps1 一键停止。

.PARAMETER Ports
  逗号分隔的端口列表，例如 -Ports "3080,3081,3082,3084"。
  默认 "3080,3081,3082,3083"。

.PARAMETER Patch
  启用多窗口墙的 patch 文件（默认 patches/multi-wall.yml）；若已把 insert
  写进 profile 的 cordis.patch.yml，可传 $null 跳过。

.PARAMETER NoOpen
  不自动打开浏览器。

.EXAMPLE
  .\start-multi.ps1 -Ports "3080,3081,3082,3084"
  .\start-multi.ps1 -Ports "3080,3081" -NoOpen
#>
param(
    [string]$Ports = "3080,3081,3082,3083",
    [string]$Patch = "",
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root ".wall-pids.json"

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
    $args = @($dsh.Source, "web", "--port", $p)
    if ($Patch) { $args += @("--patch", (Join-Path $root $Patch)) }
    $proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList $args -PassThru -WindowStyle Hidden
    $pids += $proc.Id
    $started += $p
    Write-Host "dsh web --port $p  (pid $($proc.Id))"
    Start-Sleep -Milliseconds 800
}

# 4) 记录 PID 状态
@{ pid = $pids; ports = $started; startedAt = (Get-Date).ToString("o") } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8
Write-Host "状态已保存到 $stateFile"

# 5) 打开第一个实例
if (-not $NoOpen) {
    Start-Process "http://127.0.0.1:$($started[0])"
}
Write-Host "完成：$($started -join ', ')。每个实例侧边栏底部都有「多窗口墙」按钮。"
