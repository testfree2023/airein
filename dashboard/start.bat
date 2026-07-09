@echo off
REM start.bat — 启动/停止/重启 Dashboard 管理面板 (Windows)
REM
REM 用法:
REM   start.bat              前台运行 (仅本机访问)
REM   start.bat --lan        前台运行 (局域网可访问)
REM   start.bat --open       前台运行 + 打开浏览器
REM   start.bat --bg         后台运行
REM   start.bat --bg --lan   后台运行 (局域网可访问)
REM   start.bat stop         停止后台运行
REM   start.bat restart      重启

setlocal EnableDelayedExpansion

cd /d "%~dp0"

set "PORT=3456"
if defined DASHBOARD_PORT set "PORT=%DASHBOARD_PORT%"

REM ── stop ──────────────────────────────────────────────────
if "%1"=="stop" (
  for /f %%p in (dashboard.pid) do (
    taskkill /PID %%p /F >nul 2>&1
    echo ✅ Dashboard 已停止 (PID: %%p)
  )
  del dashboard.pid 2>nul
  exit /b 0
)

REM ── restart ───────────────────────────────────────────────
if "%1"=="restart" (
  if exist dashboard.pid (
    for /f %%p in (dashboard.pid) do (
      taskkill /PID %%p /F >nul 2>&1
    )
    del dashboard.pid 2>nul
    timeout /t 1 /nobreak >nul
    echo 🔄 重启 Dashboard...
  )
  call "%~f0" --bg
  exit /b 0
)

where node >nul 2>&1
if errorlevel 1 (
  echo ❌ 未找到 Node.js，请先安装: https://nodejs.org
  exit /b 1
)

set "LAN_MODE=0"
set "BG_MODE=0"
set "OPEN_BROWSER=0"

for %%a in (%*) do (
  if "%%a"=="--lan"    set "LAN_MODE=1"
  if "%%a"=="--bg"     set "BG_MODE=1"
  if "%%a"=="--open"   set "OPEN_BROWSER=1"
)

if "%LAN_MODE%"=="1" (
  set "DASHBOARD_BIND=0.0.0.0"
  set "HOST_DISPLAY=0.0.0.0 (局域网可访问)"
) else (
  set "HOST_DISPLAY=127.0.0.1 (仅本机)"
)

if "%BG_MODE%"=="1" (
  start /b node server.js > dashboard.log 2>&1
  for /f %%p in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr /b "PID:"') do (
    echo %%p > dashboard.pid
  )
  echo ✅ Dashboard 后台启动
  echo    绑定: %HOST_DISPLAY%
  echo    地址: http://localhost:%PORT%
  echo    日志: %cd%\dashboard.log
  exit /b 0
)

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   Dashboard — http://localhost:%PORT%
echo   绑定: %HOST_DISPLAY%
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if "%OPEN_BROWSER%"=="1" (
  start "" "http://localhost:%PORT%"
)

node server.js
