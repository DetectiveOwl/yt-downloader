@echo off
title Chiudi Downloader
color 0C

echo.
echo ============================================================
echo   STO CHIUDENDO IL DOWNLOADER IN BACKGROUND...
echo ============================================================
echo.

FOR /F "tokens=5" %%a IN ('netstat -aon ^| find ":3000" ^| find "LISTENING"') DO taskkill /f /pid %%a

echo.
echo Operazione completata. Il programma e' stato chiuso!
timeout /t 3 >nul
