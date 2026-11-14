@echo off
title MikroDesk
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installation des dependances de MikroDesk...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Echec de l'installation. Verifiez que Node.js est installe.
    pause
    exit /b 1
  )
  if not exist "node_modules\electron\dist\electron.exe" (
    node node_modules\electron\install.js
  )
)

echo Demarrage de MikroDesk...
call npm start
if errorlevel 1 pause
