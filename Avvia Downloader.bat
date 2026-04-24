@echo off
title YouTube MP3 Downloader Server
color 0A

echo.
echo ============================================================
echo   YOUTUBE MP3 DOWNLOADER - NON CHIUDERE QUESTA FINESTRA!
echo ============================================================
echo.
echo Ciao! Sto avviando il tuo downloader...
echo Attendi qualche istante e si aprira' il browser automaticamente.
echo.
echo NOTA: Per spegnere il programma, chiudi semplicemente 
echo questa finestra nera.
echo ============================================================
echo.

:: Si sposta automaticamente nella cartella in cui si trova il file .bat
cd /d "%~dp0"

:: Apri automaticamente localhost nel browser predefinito
start http://localhost:3000

:: Avvia l'applicazione Node.js in primo piano
npm start

:: Evita che la finestra si chiuda in caso di errore anomalo
pause
