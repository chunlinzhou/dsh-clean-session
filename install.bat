@echo off
chcp 65001 >nul
echo ==========================================================
echo    安装 DeepSeek Harness 彻底删除会话插件 (Windows)
echo ==========================================================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 后重试。
    pause
    exit /b 1
)

node "%~dp0scripts\install.mjs"
pause
