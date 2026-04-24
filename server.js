// ============================================================
// server.js - Backend del Media Downloader
// Supporta YouTube, SoundCloud e Spotify
// Download audio (MP3, WAV) e video (MP4)
// ============================================================

const express = require("express");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = 3000;

// Directory per i file temporanei
const TEMP_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Middleware per servire i file statici dalla cartella "public"
app.use(express.static(path.join(__dirname, "public")));

// Middleware per parsare il body JSON delle richieste
app.use(express.json());

// ============================================================
// Funzioni di utilità: validazione URL e rilevamento piattaforma
// ============================================================

function detectPlatform(url) {
  if (!url) return null;
  const u = url.trim().toLowerCase();

  // YouTube
  if (/^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i.test(u)) {
    return 'youtube';
  }
  // SoundCloud
  if (/^(https?:\/\/)?(www\.|m\.)?soundcloud\.com\//i.test(u)) {
    return 'soundcloud';
  }
  // Spotify
  if (/^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\//i.test(u)) {
    return 'spotify';
  }
  return null;
}

function isValidUrl(url) {
  return detectPlatform(url) !== null;
}

function getYtDlpPath() {
  return "yt-dlp";
}

function getSpotdlPath() {
  return "spotdl";
}

// ============================================================
// API: GET /api/info
// Recupera informazioni sul contenuto (titolo, thumbnail, durata)
// Supporta YouTube, SoundCloud (via yt-dlp) e Spotify (via spotdl)
// ============================================================
app.get("/api/info", (req, res) => {
  const { url } = req.query;
  const platform = detectPlatform(url);

  if (!url || !platform) {
    return res.status(400).json({ error: "URL non valido. Supportati: YouTube, SoundCloud, Spotify" });
  }

  if (platform === 'spotify') {
    // Per Spotify usiamo spotdl per ottenere le info
    const spotdl = getSpotdlPath();
    execFile(
      spotdl,
      ["url", url, "--print", "json"],
      { timeout: 30000, shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Errore spotdl info:", error.message);
          // Fallback: restituisci info base estratte dall'URL
          return res.json({
            title: "Brano Spotify",
            thumbnail: "",
            duration: 0,
            channel: "Spotify",
            platform: 'spotify'
          });
        }

        try {
          // spotdl può restituire più righe JSON, prendiamo la prima
          const firstLine = stdout.trim().split('\n')[0];
          const info = JSON.parse(firstLine);
          res.json({
            title: info.name || info.title || "Brano Spotify",
            thumbnail: info.cover_url || info.album_art || "",
            duration: info.duration || 0,
            channel: info.artist || info.artists?.[0] || "Artista sconosciuto",
            platform: 'spotify'
          });
        } catch (parseError) {
          console.error("Errore parsing spotdl JSON:", parseError.message);
          res.json({
            title: "Brano Spotify",
            thumbnail: "",
            duration: 0,
            channel: "Spotify",
            platform: 'spotify'
          });
        }
      }
    );
  } else {
    // YouTube e SoundCloud usano yt-dlp
    const ytDlp = getYtDlpPath();
    execFile(
      ytDlp,
      [
        "--dump-json",
        "--no-download",
        "--no-warnings",
        url,
      ],
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Errore yt-dlp info:", error.message);
          return res
            .status(500)
            .json({ error: "Impossibile recuperare le informazioni" });
        }

        try {
          const info = JSON.parse(stdout);
          res.json({
            title: info.title || "Titolo sconosciuto",
            thumbnail: info.thumbnail || "",
            duration: info.duration || 0,
            channel: info.channel || info.uploader || "Sconosciuto",
            platform: platform
          });
        } catch (parseError) {
          console.error("Errore parsing JSON:", parseError.message);
          res
            .status(500)
            .json({ error: "Errore nell'elaborazione delle informazioni" });
        }
      },
    );
  }
});

// ============================================================
// API: POST /api/download
// Scarica audio/video da YouTube/SoundCloud/Spotify
// ============================================================
app.post("/api/download", (req, res) => {
  const { url, format = 'mp3', quality = '1080' } = req.body;
  const platform = detectPlatform(url);

  if (!url || !platform) {
    return res.status(400).json({ error: "URL non valido. Supportati: YouTube, SoundCloud, Spotify" });
  }

  const fileId = uuidv4();

  if (format === 'mp4') {
    // ---- VIDEO: usa yt-dlp per scaricare video+audio ----
    if (platform === 'spotify') {
      return res.status(400).json({ error: "Il download video non è supportato per Spotify" });
    }
    downloadVideoWithYtDlp(url, quality, fileId, platform, res);
  } else if (platform === 'spotify') {
    // ---- SPOTIFY: usa spotdl ----
    downloadWithSpotdl(url, format, fileId, res);
  } else {
    // ---- YOUTUBE / SOUNDCLOUD AUDIO: usa yt-dlp + ffmpeg ----
    downloadWithYtDlp(url, format, fileId, platform, res);
  }
});

// ============================================================
// Download con yt-dlp (YouTube + SoundCloud)
// ============================================================
function downloadWithYtDlp(url, format, fileId, platform, res) {
  const tempAudioPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);
  const outputFilePath = path.join(TEMP_DIR, `${fileId}.${format}`);
  const ytDlp = getYtDlpPath();

  console.log(`[Download] Inizio download ${platform} per: ${url}`);

  const ytProcess = spawn(ytDlp, [
    "-f", "bestaudio",
    "-o", tempAudioPath,
    "--no-playlist",
    "--no-warnings",
    "--newline",
    url,
  ]);

  let downloadedFilePath = "";

  ytProcess.stdout.on("data", (data) => {
    console.log(`[yt-dlp] ${data.toString().trim()}`);
  });

  ytProcess.stderr.on("data", (data) => {
    console.error(`[yt-dlp stderr] ${data.toString().trim()}`);
  });

  ytProcess.on("close", (code) => {
    if (code !== 0) {
      console.error(`[Download] yt-dlp terminato con codice ${code}`);
      cleanup([]);
      return res
        .status(500)
        .json({ error: "Errore durante il download" });
    }

    console.log("[Download] Download completato, inizio conversione...");

    const tempFiles = fs
      .readdirSync(TEMP_DIR)
      .filter((f) => f.startsWith(fileId) && !f.endsWith(`.${format}`));
    if (tempFiles.length === 0) {
      return res
        .status(500)
        .json({ error: "File audio non trovato dopo il download" });
    }

    downloadedFilePath = path.join(TEMP_DIR, tempFiles[0]);

    // Converti nel formato desiderato usando ffmpeg
    let ffmpegCmd = ffmpeg(downloadedFilePath);

    if (format === 'wav') {
      ffmpegCmd = ffmpegCmd.toFormat('wav');
    } else {
      ffmpegCmd = ffmpegCmd
        .audioBitrate('320k')
        .audioCodec("libmp3lame")
        .toFormat("mp3");
    }

    ffmpegCmd
      .on("start", (cmd) => {
        console.log(`[ffmpeg] Comando: ${cmd}`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[ffmpeg] Progresso: ${Math.round(progress.percent)}%`);
        }
      })
      .on("error", (err) => {
        console.error("[ffmpeg] Errore conversione:", err.message);
        cleanup([downloadedFilePath, outputFilePath]);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: `Errore durante la conversione in ${format.toUpperCase()}` });
        }
      })
      .on("end", () => {
        console.log("[ffmpeg] Conversione completata!");

        // Recupera il titolo per il nome del file
        execFile(
          ytDlp,
          ["--get-title", "--no-warnings", url],
          { timeout: 15000 },
          (err, title) => {
            let fileName = `audio.${format}`;
            if (!err && title) {
              const sanitized = title
                .trim()
                .replace(/[<>:"/\\|?*]/g, "_")
                .substring(0, 100);
              fileName = `${sanitized}.${format}`;
            }

            res.setHeader("Content-Type", format === 'wav' ? "audio/wav" : "audio/mpeg");
            res.setHeader(
              "Content-Disposition",
              `attachment; filename="${encodeURIComponent(fileName)}"`,
            );

            const fileStream = fs.createReadStream(outputFilePath);
            fileStream.pipe(res);

            fileStream.on("end", () => {
              console.log("[Download] File inviato con successo");
              cleanup([downloadedFilePath, outputFilePath]);
            });

            fileStream.on("error", (streamErr) => {
              console.error("[Stream] Errore:", streamErr.message);
              cleanup([downloadedFilePath, outputFilePath]);
              if (!res.headersSent) {
                res.status(500).json({ error: "Errore nell'invio del file" });
              }
            });
          },
        );
      })
      .save(outputFilePath);
  });
}

// ============================================================
// Download Video con yt-dlp (YouTube + SoundCloud) - MP4
// ============================================================
function downloadVideoWithYtDlp(url, quality, fileId, platform, res) {
  const outputFilePath = path.join(TEMP_DIR, `${fileId}.mp4`);
  const ytDlp = getYtDlpPath();

  // Mappa qualità alla risoluzione massima
  const heightMap = {
    '1080': '1080',
    '1440': '1440',
    '2160': '2160'
  };
  const maxHeight = heightMap[quality] || '1080';

  console.log(`[Download] Inizio download video ${platform} (${maxHeight}p) per: ${url}`);

  const ytProcess = spawn(ytDlp, [
    "-f", `bestvideo[height<=${maxHeight}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]`,
    "--merge-output-format", "mp4",
    "-o", outputFilePath,
    "--no-playlist",
    "--no-warnings",
    "--newline",
    url,
  ]);

  ytProcess.stdout.on("data", (data) => {
    console.log(`[yt-dlp video] ${data.toString().trim()}`);
  });

  ytProcess.stderr.on("data", (data) => {
    console.error(`[yt-dlp video stderr] ${data.toString().trim()}`);
  });

  ytProcess.on("close", (code) => {
    if (code !== 0) {
      console.error(`[Download] yt-dlp video terminato con codice ${code}`);
      cleanup([outputFilePath]);
      return res
        .status(500)
        .json({ error: "Errore durante il download del video" });
    }

    console.log("[Download] Download video completato!");

    // Verifica che il file esista
    if (!fs.existsSync(outputFilePath)) {
      return res
        .status(500)
        .json({ error: "File video non trovato dopo il download" });
    }

    // Recupera il titolo per il nome del file
    execFile(
      ytDlp,
      ["--get-title", "--no-warnings", url],
      { timeout: 15000 },
      (err, title) => {
        let fileName = `video.mp4`;
        if (!err && title) {
          const sanitized = title
            .trim()
            .replace(/[<>:"/\\|?*]/g, "_")
            .substring(0, 100);
          fileName = `${sanitized}.mp4`;
        }

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(fileName)}"`,
        );

        const fileStream = fs.createReadStream(outputFilePath);
        fileStream.pipe(res);

        fileStream.on("end", () => {
          console.log("[Download] File video inviato con successo");
          cleanup([outputFilePath]);
        });

        fileStream.on("error", (streamErr) => {
          console.error("[Stream] Errore:", streamErr.message);
          cleanup([outputFilePath]);
          if (!res.headersSent) {
            res.status(500).json({ error: "Errore nell'invio del file" });
          }
        });
      },
    );
  });
}

// ============================================================
// Download con spotdl (Spotify)
// ============================================================
function downloadWithSpotdl(url, format, fileId, res) {
  const spotdl = getSpotdlPath();
  const outputTemplate = path.join(TEMP_DIR, `${fileId}`);

  console.log(`[Download] Inizio download Spotify per: ${url}`);

  // spotdl scarica direttamente in mp3 per default
  const args = [
    "download", url,
    "--output", outputTemplate,
    "--format", format === 'wav' ? 'wav' : 'mp3',
    "--bitrate", "320k",
  ];

  const spotProcess = spawn(spotdl, args, { shell: true });

  spotProcess.stdout.on("data", (data) => {
    console.log(`[spotdl] ${data.toString().trim()}`);
  });

  spotProcess.stderr.on("data", (data) => {
    console.error(`[spotdl stderr] ${data.toString().trim()}`);
  });

  spotProcess.on("close", (code) => {
    if (code !== 0) {
      console.error(`[Download] spotdl terminato con codice ${code}`);
      return res
        .status(500)
        .json({ error: "Errore durante il download da Spotify. Verifica che spotdl sia installato." });
    }

    console.log("[Download] Download Spotify completato!");

    // Cerca il file scaricato da spotdl nella directory temp
    const downloadedFiles = fs
      .readdirSync(TEMP_DIR)
      .filter((f) => f.startsWith(fileId));

    if (downloadedFiles.length === 0) {
      // spotdl potrebbe nominare il file con il titolo del brano
      // Cerca il file più recente nella directory temp
      const allFiles = fs.readdirSync(TEMP_DIR)
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(TEMP_DIR, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);

      if (allFiles.length === 0) {
        return res
          .status(500)
          .json({ error: "File audio non trovato dopo il download" });
      }

      // Usa il file più recente
      const recentFile = allFiles[0].name;
      const recentFilePath = path.join(TEMP_DIR, recentFile);

      const ext = path.extname(recentFile);
      const baseName = path.basename(recentFile, ext);

      res.setHeader("Content-Type", format === 'wav' ? "audio/wav" : "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(recentFile)}"`,
      );

      const fileStream = fs.createReadStream(recentFilePath);
      fileStream.pipe(res);

      fileStream.on("end", () => {
        console.log("[Download] File Spotify inviato con successo");
        cleanup([recentFilePath]);
      });

      fileStream.on("error", (streamErr) => {
        console.error("[Stream] Errore:", streamErr.message);
        cleanup([recentFilePath]);
        if (!res.headersSent) {
          res.status(500).json({ error: "Errore nell'invio del file" });
        }
      });
    } else {
      const outputFile = downloadedFiles[0];
      const outputFilePath = path.join(TEMP_DIR, outputFile);

      res.setHeader("Content-Type", format === 'wav' ? "audio/wav" : "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(outputFile)}"`,
      );

      const fileStream = fs.createReadStream(outputFilePath);
      fileStream.pipe(res);

      fileStream.on("end", () => {
        console.log("[Download] File Spotify inviato con successo");
        cleanup([outputFilePath]);
      });

      fileStream.on("error", (streamErr) => {
        console.error("[Stream] Errore:", streamErr.message);
        cleanup([outputFilePath]);
        if (!res.headersSent) {
          res.status(500).json({ error: "Errore nell'invio del file" });
        }
      });
    }
  });
}

// ============================================================
// Funzione di pulizia: rimuove i file temporanei
// ============================================================
function cleanup(filePaths) {
  filePaths.forEach((filePath) => {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Cleanup] Rimosso: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.error(`[Cleanup] Errore rimozione ${filePath}:`, err.message);
    }
  });
}

// ============================================================
// Pulizia periodica: rimuove file temp più vecchi di 10 minuti
// ============================================================
setInterval(
  () => {
    if (!fs.existsSync(TEMP_DIR)) return;
    const now = Date.now();
    fs.readdirSync(TEMP_DIR).forEach((file) => {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 10 * 60 * 1000) {
          fs.unlinkSync(filePath);
          console.log(`[Cleanup] Auto-rimosso: ${file}`);
        }
      } catch (err) {
        // Ignora errori durante la pulizia
      }
    });
  },
  5 * 60 * 1000,
);

// ============================================================
// Avvia il server
// ============================================================
app.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║      Media Downloader - Server Avviato       ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║   🌐 http://localhost:${PORT}                  ║`);
  console.log("║   📁 File serviti da: /public                ║");
  console.log("║   🎵 YouTube | SoundCloud | Spotify          ║");
  console.log("║   🎬 Audio (MP3/WAV) + Video (MP4)           ║");
  console.log("╚══════════════════════════════════════════════╝");
});
