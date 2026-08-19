#requires -Version 5.1
<#
.SYNOPSIS
  把多窗口墙插件装进 DSH web profile 并启用（官方声明式 bundle 形态）。

.DESCRIPTION
  1) 将 dsh-multi-chat 打包为 tarball；
  2) 用 `dsh plugin --profile web add` 装进 profile；
  3) DSH 自动调和 dsh.profile.bundles：插件包声明了 dsh.bundle.patch
     （指向包内自带 cordis.patch.yml），DSH 启动时自动挂载该 bundle 层，
     无需手动编辑 profile 的 cordis.patch.yml；
  4) 提示重启 `dsh web` 生效（打开 http://127.0.0.1:<port> 后，
     侧边栏底部会出现「多窗口墙」按钮）。

  卸载（一条命令，无需手动删 patch 或文件）：
    dsh plugin --profile <Profile> remove dsh-multi-chat

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

# 1) pack tarball from root directory
$tarball = Join-Path $root "dsh-multi-chat.tgz"
Push-Location $root
npm pack --pack-destination $root | Out-Null
Pop-Location
if (-not (Test-Path $tarball)) { throw "npm pack 失败，未生成 $tarball" }
Write-Host "已打包：$tarball"

# 2) install into profile — DSH 依据插件的 dsh.bundle 声明自动把包加入
#    dsh.profile.bundles 层栈并挂载其自带 cordis.patch.yml，无需手改 patch。
Write-Host "安装到 profile '$Profile'（等价于 pnpm add <tarball>）…"
dsh plugin --profile $Profile add $tarball
if ($LASTEXITCODE -ne 0) { throw "dsh plugin add 失败（exit $LASTEXITCODE）" }

Write-Host ""
Write-Host "完成。重启 dsh web 生效："
Write-Host "  dsh web --port <n>"
Write-Host "打开后侧边栏底部应出现「多窗口墙」按钮。"
Write-Host "卸载：dsh plugin --profile $Profile remove dsh-multi-chat"
