Set WshShell = CreateObject("WScript.Shell")
' Avvia il server Node.js in modo invisibile (0) senza finestre cmd nere
WshShell.Run "node ""c:\Users\ricca\OneDrive\Desktop\yt_downloader\server.js""", 0, False
' Attendi 2 secondi per dare tempo al server di avviarsi
WScript.Sleep 2000
' Apri il browser predefinito su localhost
WshShell.Run "http://localhost:3000"
