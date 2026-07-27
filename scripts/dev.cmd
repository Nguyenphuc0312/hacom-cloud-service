@echo off
setlocal

if "%~1"=="" goto usage

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
exit /b %errorlevel%

:usage
echo Usage: %~nx0 ^<up^|down^|logs^|ps^|config^>
exit /b 1
