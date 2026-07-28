@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo  Pink Promise - Finalize Video Migration
echo ======================================================
echo.
echo This script DOES NOT delete your local video files.
echo It regenerates starter-gallery.js with PHOTOS ONLY and
echo removes the video folder from Git tracking.
echo.

where node >nul 2>nul
if %errorlevel%==0 (
  node "%~dp0tools\generate-gallery-manifest.mjs"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\generate-gallery-manifest.ps1"
)
if errorlevel 1 (
  echo.
  echo ERROR: The starter gallery generator failed.
  pause
  exit /b 1
)

if not exist ".git" (
  echo.
  echo No .git folder was found. starter-gallery.js was updated,
  echo but Git tracking could not be cleaned automatically.
  echo Open this project inside the correct repository and run again.
  pause
  exit /b 1
)

if not exist "assets\gallery\videos\vlogs" mkdir "assets\gallery\videos\vlogs"
if not exist "assets\gallery\videos\normal-videos" mkdir "assets\gallery\videos\normal-videos"
if not exist "assets\gallery\videos\vlogs\.gitkeep" type nul > "assets\gallery\videos\vlogs\.gitkeep"
if not exist "assets\gallery\videos\normal-videos\.gitkeep" type nul > "assets\gallery\videos\normal-videos\.gitkeep"

echo.
echo Removing videos from Git tracking only...
git rm -r --cached --ignore-unmatch "assets/gallery/videos" >nul 2>nul
git add ".gitignore" "starter-gallery.js" "tools/generate-gallery-manifest.mjs" "tools/generate-gallery-manifest.ps1" "assets/gallery/videos/vlogs/.gitkeep" "assets/gallery/videos/normal-videos/.gitkeep"

echo.
echo Done. Your local videos are still on this computer and are now ignored.
echo Review the staged changes below, then commit and push:
echo.
git status --short

echo.
echo Suggested commands:
echo   git commit -m "Move gallery videos to Google Drive"
echo   git push origin main
echo.
pause
