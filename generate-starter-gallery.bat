@echo off
setlocal
cd /d "%~dp0"
echo Generating Pink Promise starter gallery...
echo.
where node >nul 2>nul
if %errorlevel%==0 (
  node "%~dp0tools\generate-gallery-manifest.mjs"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\generate-gallery-manifest.ps1"
)
echo.
pause
