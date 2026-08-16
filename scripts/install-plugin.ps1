#requires -Version 5.1
<#
.SYNOPSIS
  把多窗口墙插件装进 DSH web profile 并启用。

.DESCRIPTION
  1) 将 plugin/dsh-client-ui-multi-wall 打包为 tarball；
  2) 用 `dsh plugin --profile web add` 装进 profile；
  3) 把 patches/multi-wall.yml 的 insert 行追加到
     $DSH_HOME/profiles/web/cordis.patch.yml；
  4) 提示重启 `dsh web` 生效（打开 http://127.0.0.1:<port> 后，
     侧边栏底部会出现「多窗口墙」按钮）。

.PARAMETER Profile
  profile 名，默认 web。

.EXAMPLE
  .\scripts\install-plugin.ps1
#>
param(
    [string]$Profile = "web"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pluginDir = Join-Path $root "plugin\dsh-client-ui-multi-wall"
$patchFile = Join-Path $root "patches\multi-wall.yml"

if (-not (Test-Path $pluginDir)) { throw "未找到插件目录：$pluginDir" }
if (-not (Test-Path $patchFile)) { throw "未找到 patch 文件：$patchFile" }

# 1) pack tarball
$tarball = Join-Path $root "dsh-client-ui-multi-wall.tgz"
Push-Location $pluginDir
npm pack --pack-destination $root | Out-Null
Pop-Location
if (-not (Test-Path $tarball)) { throw "npm pack 失败，未生成 $tarball" }
Write-Host "已打包：$tarball"

# 2) install into profile
Write-Host "安装到 profile '$Profile'（等价于 pnpm add <tarball>）…"
dsh plugin --profile $Profile add $tarball
if ($LASTEXITCODE -ne 0) { throw "dsh plugin add 失败（exit $LASTEXITCODE）" }

# 3) append the insert row to the profile patch (idempotent)
$home = $env:DSH_HOME
if ([string]::IsNullOrEmpty($home)) { $home = Join-Path $env:USERPROFILE ".dsh" }
$profilePatch = Join-Path $home "profiles\$Profile\cordis.patch.yml"
if (-not (Test-Path $profilePatch)) { throw "未找到 profile patch：$profilePatch" }
$content = Get-Content $profilePatch -Raw
if ($content -notmatch "ui-multi-wall") {
    $insert = Get-Content $patchFile -Raw
    # 把 patch 文件的 insert 块合并进 profile patch（去掉头部注释，保留 YAML 列表语义）
    $insertBlock = ($insert -split "`n" | Where-Object { $_ -notmatch "^\s*#" -and $_.Trim() -ne "" }) -join "`n"
    $newContent = $content.TrimEnd() + "`n" + $insertBlock + "`n"
    Set-Content -Path $profilePatch -Value $newContent -Encoding UTF8
    Write-Host "已追加到 $profilePatch"
} else {
    Write-Host "profile patch 已包含 ui-multi-wall，跳过追加。"
}

Write-Host ""
Write-Host "完成。重启 dsh web 生效："
Write-Host "  dsh web --port <n>"
Write-Host "打开后侧边栏底部应出现「多窗口墙」按钮。"
