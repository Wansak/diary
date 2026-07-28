@echo off
setlocal
cd /d "%~dp0"

echo Restoring Pink Promise working startup...
if exist "app-bootstrap.js" del /q "app-bootstrap.js"
if exist "startup-guard.js" del /q "startup-guard.js"

echo.
echo Removed app-bootstrap.js and startup-guard.js.
echo Your Firebase config, Drive config, starter gallery, photos, and local videos were not touched.
echo.
pause
