# ==============================================================================
# dsh-clean-session PowerShell 安装脚本 (Windows)
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   安装 DeepSeek Harness 彻底删除会话插件 (Windows PowerShell)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[错误] 系统未检测到 Node.js，请先安装 Node.js 环境。" -ForegroundColor Red
    Exit 1
}

$scriptPath = Join-Path $PSScriptRoot "scripts\install.mjs"
node $scriptPath
