# gateway-start.ps1 — start the authenticated gateway with no console window.
# Wrapper around gateway-hidden.vbs (WScript.Shell window style 0 = invisible).
#
# Usage:
#   .\scripts\gateway-start.ps1
#
# Values come from gateway-hidden.vbs (port 8443 -> 127.0.0.1:3070,
# token dsh2026). Edit that file to change them.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $root 'scripts\gateway-hidden.vbs'

if (-not (Test-Path $vbs)) { throw "未找到启动器：$vbs" }

# wscript runs the VBS with a hidden window (no console flash).
Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $vbs + '"') -WindowStyle Hidden | Out-Null

Write-Host "网关已在后台静默启动（无窗口）。"
Write-Host "手机访问：http://<局域网IP>:8443  （口令 dsh2026）"
Write-Host "停止：.\scripts\gateway-stop.ps1"
