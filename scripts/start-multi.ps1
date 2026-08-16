#requires -Version 5.1
<#
.SYNOPSIS
  启动多个 DSH web 实例（多窗口墙直接内嵌在官方界面里，无需独立服务器）。

.DESCRIPTION
  依次启动 `dsh web --port <n>`（默认 3080..3083 共 4 个实例）。每个实例的
  侧边栏底部都有「多窗口墙」按钮（安装 plugin/dsh-client-ui-multi-wall 后），
  点击即可在官方界面内看到所有实例并排显示。所有子进程 PID 记录到状态文件，
  供 stop-multi.ps1 一键停止。

  官方 CLI 出于安全禁止 `--host 0.0.0.0`（会向网络暴露远程代码执行），因此
  手机/远程访问请加 -Remote：脚本会在每个实例前启动一个带令牌认证的网关
  （scripts/gateway.mjs），网关监听 0.0.0.0，实例本身保持仅本机回环。手机在
  同一内网打开 http://<局域网IP>:<网关端口>/，输入令牌即可登录使用。

.PARAMETER Ports
  逗号分隔的端口列表，例如 -Ports "3080,3081,3082,3084"。
  默认 "3080,3081,3082,3083"。

.PARAMETER Patch
  启用多窗口墙的 patch 文件（默认 patches/multi-wall.yml）；若已把 insert
  写进 profile 的 cordis.patch.yml，可传 $null 跳过。

.PARAMETER Remote
  为每个实例启动一个带令牌认证的网关（0.0.0.0），用于手机/远程访问。

.PARAMETER Token
  网关登录令牌；-Remote 下必填（缺省则自动生成并打印）。

.PARAMETER GatewayPorts
  网关外部端口（逗号分隔，数量须与实例一致）；默认 = 实例端口 + 5000，
  若落在 Windows 排除端口段（Hyper-V/WinNAT）则自动顺延。

.PARAMETER TlsCert / TlsKey
  提供 PEM 证书与私钥时，网关以 HTTPS（加密）对外服务。

.PARAMETER NoOpen
  不自动打开浏览器。

.EXAMPLE
  .\start-multi.ps1 -Ports "3080,3081,3082,3084"
  .\start-multi.ps1 -Ports "3080,3081" -NoOpen
  .\start-multi.ps1 -Ports "3080,3081" -Remote -Token "my-secret"
  .\start-multi.ps1 -Ports "3080" -Remote -Token "s3cret" -TlsCert cert.pem -TlsKey key.pem
#>
param(
    [string]$Ports = "3080,3081,3082,3083",
    [string]$Patch = "",
    [switch]$Remote,
    [string]$Token = "",
    [string]$GatewayPorts = "",
    [string]$TlsCert = "",
    [string]$TlsKey = "",
    [string]$Name = "DSH",
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root ".wall-pids.json"

# 1) 解析端口列表
$portList = @($Ports -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' })
if ($portList.Count -eq 0) { throw "没有有效的端口列表：$Ports" }

# 2) 解析 dsh 的真实 JS bin（npm 全局装的 dsh 在 PATH 里是 .ps1/.cmd shim，
#    node 不能直接执行 shim，必须解析出真正的 bin.js）
function Get-DshJsBin {
    $cmd = Get-Command dsh -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    $source = $cmd.Source
    if ($source -match 'bin\.js$') { return $source }
    if ($source -match '\.ps1$|\.cmd$') {
        $content = Get-Content $source -Raw
        if ($content -match 'node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]([^\s"''%]+)') {
            $rel = $Matches[1] -replace '/', '\'
            $candidate = Join-Path (Split-Path $source) "node_modules\@deepseek-ai\dsh\$rel"
            if (Test-Path $candidate) { return $candidate }
        }
    }
    return $null
}
$dshJs = Get-DshJsBin
if (-not $dshJs) {
    Write-Host "警告：无法解析 dsh 的 JS bin，将尝试直接调用 dsh 命令。"
    $dshCmd = Get-Command dsh -ErrorAction SilentlyContinue
    if (-not $dshCmd) { throw "未找到 dsh 命令，请先安装 @deepseek-ai/dsh（npm i -g @deepseek-ai/dsh）" }
}

# 3) 远程模式：令牌与网关端口
if ($Remote -and [string]::IsNullOrEmpty($Token)) {
    $Token = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    Write-Host "已生成网关令牌：$Token （请保存！）"
}
$gwPortList = @()
if ($Remote) {
    if (-not [string]::IsNullOrEmpty($GatewayPorts)) {
        $gwPortList = @($GatewayPorts -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' })
        if ($gwPortList.Count -lt $portList.Count) { throw "GatewayPorts 数量（$($gwPortList.Count)）少于实例数量（$($portList.Count)）" }
    } else {
        # 默认实例端口 + 5000，避开 Windows 排除端口段与已占用端口
        $excluded = @()
        netsh interface ipv4 show excludedportrange protocol=tcp 2>$null |
            Select-String '^\s*\d+\s+\d+\s*$' |
            ForEach-Object {
                if ($_ -match '^\s*(\d+)\s+(\d+)\s*$') { $excluded += ,@([int]$Matches[1], [int]$Matches[2]) }
            }
        foreach ($p in $portList) {
            $candidate = [int]$p + 5000
            for (; $candidate -lt [int]$p + 5500; $candidate++) {
                $inUse = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
                if ($inUse) { continue }
                $blocked = $false
                foreach ($range in $excluded) {
                    if ($candidate -ge $range[0] -and $candidate -le $range[1]) { $blocked = $true; break }
                }
                if (-not $blocked) { break }
            }
            $gwPortList += $candidate
            if ($candidate -ne ([int]$p + 5000)) { Write-Host "网关端口 $([int]$p + 5000) 不可用，改用 $candidate" }
        }
    }
}

# 4) 启动每个 dsh web 实例
$pids = @()
$started = @()
$gateways = @()
foreach ($p in $portList) {
    if ($dshJs) {
        $args = @($dshJs, "web", "--port", $p)
        $proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList $args -PassThru -WindowStyle Hidden
    } else {
        $args = @("web", "--port", $p)
        $proc = Start-Process -FilePath (Get-Command dsh).Source -ArgumentList $args -PassThru -WindowStyle Hidden
    }
    $pids += $proc.Id
    $started += $p
    Write-Host "dsh web --port $p  (pid $($proc.Id))"
    Start-Sleep -Milliseconds 800
}

# 5) 远程模式：每个实例前启动一个带令牌认证的网关
if ($Remote) {
    $gatewayScript = Join-Path $root "scripts\gateway.mjs"
    if (-not (Test-Path $gatewayScript)) { throw "未找到网关脚本：$gatewayScript" }
    for ($i = 0; $i -lt $portList.Count; $i++) {
        $gArgs = @($gatewayScript, "--target", "127.0.0.1:$($portList[$i])", "--listen", "0.0.0.0:$($gwPortList[$i])", "--token", $Token, "--name", $Name)
        if ($TlsCert -and $TlsKey) { $gArgs += @("--tls-cert", $TlsCert, "--tls-key", $TlsKey) }
        $gwProc = Start-Process -FilePath (Get-Command node).Source -ArgumentList $gArgs -PassThru -WindowStyle Hidden
        $gateways += ,@{ port = [int]$portList[$i]; gatewayPort = [int]$gwPortList[$i]; pid = $gwProc.Id }
        Write-Host "网关 :$($gwPortList[$i]) -> 127.0.0.1:$($portList[$i])  (pid $($gwProc.Id))"
        Start-Sleep -Milliseconds 300
    }
}

# 6) 记录 PID 状态
@{ pid = $pids; ports = $started; gateways = $gateways; startedAt = (Get-Date).ToString("o") } | ConvertTo-Json -Depth 4 | Set-Content -Path $stateFile -Encoding UTF8
Write-Host "状态已保存到 $stateFile"

# 7) 打印手机/远程访问地址 + 打开第一个实例
if ($Remote) {
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { -not $_.IPAddress.StartsWith("127.") -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -ExpandProperty IPAddress -Unique)
    if ($ips.Count -eq 0) { $ips = @("localhost") }
    $scheme = "http"
    if ($TlsCert -and $TlsKey) { $scheme = "https" }
    Write-Host ""
    Write-Host "手机/远程访问（需输入令牌）："
    for ($i = 0; $i -lt $gateways.Count; $i++) {
        $g = $gateways[$i]
        $urls = ($ips | ForEach-Object { "$scheme`://$_`:$($g.gatewayPort)/" }) -join "  "
        Write-Host "  $urls   -> dsh :$($g.port)"
    }
    Write-Host "  令牌：$Token"
    if (-not $NoOpen) { Start-Process "$scheme`://127.0.0.1`:$($gwPortList[0])" }
} elseif (-not $NoOpen) {
    Start-Process "http://127.0.0.1:$($started[0])"
}
Write-Host "完成：$($started -join ', ')。每个实例侧边栏底部都有「多窗口墙」按钮。"
