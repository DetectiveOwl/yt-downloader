FROM node:20-bookworm-slim

# Aggiorna il sistema e installa le dipendenze native richieste: ffmpeg, python3 e wget
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Scarica l'ultima versione di yt-dlp e rendila eseguibile globamente
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Imposta la cartella di lavoro per l'app
WORKDIR /app

# Copia e installa le dipendenze Node.js
COPY package*.json ./
RUN npm install --omit=dev

# Copia tutto il resto del codice nell'immagine
COPY . .

# Crea la cartella temporanea e dalle i permessi completi di lettura/scrittura
RUN mkdir -p temp && chmod 777 temp

# Esponi la porta 3000 che usa il nostro server
EXPOSE 3000

# Avvia l'applicazione
CMD ["node", "server.js"]
