@echo off
rem One-click restart for DSH. Launched by explorer.exe via restart-dsh-launcher.vbs.
rem NOTE: keep this file ASCII-only with CRLF line endings.
rem  - Non-ASCII bytes in a .cmd file get misparsed by cmd.exe under other code
rem    pages: the parser splits lines mid-comment and tries to run the garbage.
rem  - LF-only endings make cmd.exe skip lines silently.
rem Steps: wait 2s -> taskkill the DSH tree -> wait 2s -> start a new instance.
rem Every step appends to restart-dsh.log for debugging.
set LOG=%~dp0restart-dsh.log
echo [%date% %time%] begin >> "%LOG%"
ping -n 3 127.0.0.1 >nul
taskkill /F /T /IM "DeepSeek Harness.exe" >> "%LOG%" 2>&1
echo [%date% %time%] taskkill done rc=%errorlevel% >> "%LOG%"
ping -n 3 127.0.0.1 >nul
if defined DSH_EXE (start "" "%DSH_EXE%") else start "" "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
echo [%date% %time%] restarted rc=%errorlevel% >> "%LOG%"
