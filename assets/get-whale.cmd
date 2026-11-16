@echo off
title coo-pet - get whale textures
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-whale.ps1"
echo.
echo If the download failed, please download it manually:
echo   https://github.com/takboo/dsh-coopanion/releases/latest/download/dsh-coopanion.tgz
echo Then open the tgz, find the "whale" folder (it contains model.json),
echo and copy that folder into assets\pet\whale
echo.
pause
