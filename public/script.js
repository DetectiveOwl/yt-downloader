// ==============================================================
// script.js - Logica frontend dell'Audio Downloader
// Supporta YouTube, SoundCloud e Spotify
// ==============================================================

// ---- Riferimenti agli elementi del DOM ----
const urlInput = document.getElementById('urlInput');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const videoPreview = document.getElementById('videoPreview');
const previewThumb = document.getElementById('previewThumb');
const previewTitle = document.getElementById('previewTitle');
const previewChannel = document.getElementById('previewChannel');
const previewDuration = document.getElementById('previewDuration');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const errorBar = document.getElementById('errorBar');
const errorText = document.getElementById('errorText');
const successBar = document.getElementById('successBar');
const platformBadge = document.getElementById('platformBadge');
const platformIcon = document.getElementById('platformIcon');
const platformName = document.getElementById('platformName');
const qualitySelector = document.getElementById('qualitySelector');

// ---- Stato dell'applicazione ----
let isDownloading = false;
let infoFetchTimeout = null;

// ---- Configurazione piattaforme ----
const PLATFORMS = {
  youtube: {
    name: 'YouTube',
    icon: 'YT',
    color: '#333333',
    patterns: [
      /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i
    ]
  },
  soundcloud: {
    name: 'SoundCloud',
    icon: 'SC',
    color: '#333333',
    patterns: [
      /^(https?:\/\/)?(www\.|m\.)?soundcloud\.com\//i
    ]
  },
  spotify: {
    name: 'Spotify',
    icon: 'SP',
    color: '#333333',
    patterns: [
      /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\//i
    ]
  }
};

// ==============================================================
// Rilevamento piattaforma e validazione URL
// ==============================================================
function detectPlatform(url) {
  if (!url) return null;
  const trimmed = url.trim();

  for (const [key, platform] of Object.entries(PLATFORMS)) {
    for (const pattern of platform.patterns) {
      if (pattern.test(trimmed)) {
        return key;
      }
    }
  }
  return null;
}

function isValidUrl(url) {
  return detectPlatform(url) !== null;
}

// ==============================================================
// Formattazione durata (secondi → MM:SS o HH:MM:SS)
// ==============================================================
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ==============================================================
// Gestione UI: mostra/nascondi elementi
// ==============================================================

function showStatus(message, progressWidth = null) {
  statusBar.classList.remove('hidden');
  statusText.textContent = message;

  if (progressWidth !== null) {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = progressWidth + '%';
  } else {
    progressBar.classList.add('indeterminate');
  }
}

function hideStatus() {
  statusBar.classList.add('hidden');
  progressBar.style.width = '0%';
  progressBar.classList.remove('indeterminate');
}

function showError(message) {
  errorBar.classList.remove('hidden');
  errorText.textContent = message;
  successBar.classList.add('hidden');

  setTimeout(() => {
    errorBar.classList.add('hidden');
  }, 6000);
}

function showSuccess() {
  successBar.classList.remove('hidden');
  errorBar.classList.add('hidden');

  setTimeout(() => {
    successBar.classList.add('hidden');
  }, 5000);
}

function resetDownloadBtn() {
  downloadBtn.classList.remove('loading');
  const formatNode = document.querySelector('input[name="format"]:checked');
  const format = formatNode ? formatNode.value.toUpperCase() : 'MP3';
  if (format === 'MP4') {
    const qualityNode = document.querySelector('input[name="quality"]:checked');
    const quality = qualityNode ? qualityNode.value : '1080';
    const qualityLabel = quality === '2160' ? '4K' : quality + 'p';
    downloadBtn.querySelector('.btn-text').textContent = `Scarica MP4 ${qualityLabel}`;
  } else {
    downloadBtn.querySelector('.btn-text').textContent = `Scarica ${format}`;
  }
  isDownloading = false;
}

// Mostra/nascondi badge piattaforma con animazione
function showPlatformBadge(platformKey) {
  const platform = PLATFORMS[platformKey];
  if (!platform) {
    platformBadge.classList.add('hidden');
    return;
  }

  platformIcon.textContent = platform.icon;
  platformName.textContent = platform.name;
  platformBadge.style.setProperty('--platform-color', platform.color);
  platformBadge.classList.remove('hidden');
}

function hidePlatformBadge() {
  platformBadge.classList.add('hidden');
}

// Aggiorna il testo del pulsante quando cambia il formato
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[name="format"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const isMp4 = e.target.value === 'mp4';

      // Mostra/nascondi selettore qualità
      if (isMp4) {
        qualitySelector.classList.remove('hidden');
      } else {
        qualitySelector.classList.add('hidden');
      }

      if (!isDownloading && !downloadBtn.disabled) {
        if (isMp4) {
          const qualityNode = document.querySelector('input[name="quality"]:checked');
          const quality = qualityNode ? qualityNode.value : '1080';
          const qualityLabel = quality === '2160' ? '4K' : quality + 'p';
          downloadBtn.querySelector('.btn-text').textContent = `Scarica MP4 ${qualityLabel}`;
        } else {
          downloadBtn.querySelector('.btn-text').textContent = `Scarica ${e.target.value.toUpperCase()}`;
        }
      }
    });
  });

  // Aggiorna il pulsante quando cambia la qualità
  document.querySelectorAll('input[name="quality"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const formatNode = document.querySelector('input[name="format"]:checked');
      if (formatNode && formatNode.value === 'mp4' && !isDownloading && !downloadBtn.disabled) {
        const qualityLabel = e.target.value === '2160' ? '4K' : e.target.value + 'p';
        downloadBtn.querySelector('.btn-text').textContent = `Scarica MP4 ${qualityLabel}`;
      }
    });
  });
});

// ==============================================================
// Evento: Input URL - Abilita/disabilita pulsante + fetch info
// ==============================================================
urlInput.addEventListener('input', () => {
  const url = urlInput.value.trim();
  const platform = detectPlatform(url);
  const isValid = platform !== null;

  // Mostra/nascondi pulsante cancella
  clearBtn.classList.toggle('visible', url.length > 0);

  // Abilita il pulsante download solo se l'URL è valido
  downloadBtn.disabled = !isValid || isDownloading;

  // Nascondi errore quando l'utente modifica l'URL
  errorBar.classList.add('hidden');
  successBar.classList.add('hidden');

  // Mostra/nascondi badge piattaforma
  if (isValid) {
    showPlatformBadge(platform);
  } else {
    hidePlatformBadge();
  }

  // Debounce: aspetta 800ms prima di caricare l'anteprima
  clearTimeout(infoFetchTimeout);
  if (isValid) {
    infoFetchTimeout = setTimeout(() => fetchVideoInfo(url), 800);
  } else {
    videoPreview.classList.add('hidden');
  }
});

// ==============================================================
// Evento: Pulsante Cancella - Resetta l'input
// ==============================================================
clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.classList.remove('visible');
  downloadBtn.disabled = true;
  videoPreview.classList.add('hidden');
  hidePlatformBadge();
  hideStatus();
  errorBar.classList.add('hidden');
  successBar.classList.add('hidden');
  urlInput.focus();
});

// ==============================================================
// Evento: Paste - attiva automaticamente la validazione
// ==============================================================
urlInput.addEventListener('paste', () => {
  setTimeout(() => {
    urlInput.dispatchEvent(new Event('input'));
  }, 100);
});

// ==============================================================
// Recupera le informazioni del contenuto per l'anteprima
// ==============================================================
async function fetchVideoInfo(url) {
  try {
    const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      videoPreview.classList.add('hidden');
      return;
    }

    const info = await response.json();

    // Aggiorna l'anteprima con i dati ricevuti
    if (info.thumbnail) {
      previewThumb.src = info.thumbnail;
      previewThumb.style.display = '';
    } else {
      previewThumb.style.display = 'none';
    }
    previewTitle.textContent = info.title;
    previewChannel.textContent = info.channel;
    previewDuration.textContent = formatDuration(info.duration);

    // Mostra l'anteprima con animazione
    videoPreview.classList.remove('hidden');
  } catch (err) {
    console.warn('Impossibile caricare anteprima:', err.message);
    videoPreview.classList.add('hidden');
  }
}

// ==============================================================
// Evento: Click sul pulsante Download
// ==============================================================
downloadBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  const formatNode = document.querySelector('input[name="format"]:checked');
  const format = formatNode ? formatNode.value : 'mp3';
  const qualityNode = document.querySelector('input[name="quality"]:checked');
  const quality = qualityNode ? qualityNode.value : '1080';
  const platform = detectPlatform(url);

  if (!url || !platform || isDownloading) return;

  // Imposta lo stato di caricamento
  isDownloading = true;
  downloadBtn.classList.add('loading');
  downloadBtn.querySelector('.btn-text').textContent = 'Download in corso...';
  downloadBtn.disabled = true;

  // Nasconde eventuali messaggi precedenti
  errorBar.classList.add('hidden');
  successBar.classList.add('hidden');

  const platformLabel = PLATFORMS[platform]?.name || 'Sorgente';

  try {
    // ---- FASE 1: Download in corso ----
    showStatus(`📥 Download da ${platformLabel} in corso...`, null);

    await new Promise(resolve => setTimeout(resolve, 500));

    // ---- FASE 2: Invio richiesta al backend ----
    if (format === 'mp4') {
      const qualityLabel = quality === '2160' ? '4K' : quality + 'p';
      showStatus(`🔄 Download video ${qualityLabel}...`, null);
    } else {
      showStatus(`🔄 Conversione in ${format.toUpperCase()}...`, null);
    }

    const body = { url, format };
    if (format === 'mp4') body.quality = quality;

    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let errorMessage = 'Errore durante il download';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Se non è JSON, usa il messaggio di default
      }
      throw new Error(errorMessage);
    }

    // ---- FASE 3: Ricezione file ----
    showStatus('📦 Ricezione file...', 80);

    const blob = await response.blob();

    const disposition = response.headers.get('Content-Disposition');
    let fileName = `audio.${format}`;
    if (disposition) {
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
      if (match) {
        fileName = decodeURIComponent(match[1]);
      }
    }

    // ---- FASE 4: Avvio download nel browser ----
    showStatus('✅ Pronto!', 100);

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    }, 100);

    setTimeout(() => {
      hideStatus();
      showSuccess();
      resetDownloadBtn();
      downloadBtn.disabled = false;
    }, 1000);

  } catch (error) {
    console.error('Errore download:', error);
    hideStatus();
    showError(error.message || 'Si è verificato un errore durante il download');
    resetDownloadBtn();
    downloadBtn.disabled = false;
  }
});

// ==============================================================
// Scorciatoia: Enter per avviare il download
// ==============================================================
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !downloadBtn.disabled) {
    downloadBtn.click();
  }
});

// ==============================================================
// Focus automatico: seleziona tutto il testo quando si clicca
// ==============================================================
urlInput.addEventListener('focus', () => {
  if (urlInput.value) {
    urlInput.select();
  }
});
