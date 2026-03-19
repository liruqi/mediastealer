const defaultRules = [
  { id: 1, enabled: true, url: ".*", ct: "video/.*", rtype: 1 },
  { id: 2, enabled: true, url: ".*", ct: "audio/.*", rtype: 2 },
  { id: 3, enabled: true, url: ".*", ct: "application/x-shockwave-flash", rtype: 3 }
];

let config = {
  enabled: true,
  rules: defaultRules,
  automaticdownload: false,
  nosmallfiles: true,
  nozerofiles: true,
  deduplicate: true,
  autoClean: true,
  minSize: 800,
  maxSize: 0
};

chrome.storage.local.get(["config"], (result) => {
  if (result.config) {
    config = { ...config, ...result.config };
    addLog(config.enabled ? chrome.i18n.getMessage("log_enabled") : chrome.i18n.getMessage("log_disabled"));
  } else {
    chrome.storage.local.set({ config });
    addLog(chrome.i18n.getMessage("log_enabled"));
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
    if (changes.config) {
      config = { ...config, ...changes.config.newValue };
    }
  }
});

let capturedMedia = [];
let capturedLogs = [];
let downloadHistory = {}; // { url: timestamp }

// ... other code ...

function addLog(message) {
  const logStr = `[${new Date().toLocaleTimeString()}] ${message}`;
  console.log(logStr);
  capturedLogs.unshift(logStr);
  if (capturedLogs.length > 50) capturedLogs.pop();

  chrome.storage.local.set({ capturedLogs });
  chrome.runtime.sendMessage({ type: "NEW_LOG", output: logStr }).catch(() => { });
}

// Initialize captured media and history from storage on service worker start
chrome.storage.local.get(["capturedMedia", "capturedLogs", "downloadHistory"], (result) => {
  if (result.capturedMedia) capturedMedia = result.capturedMedia;
  if (result.capturedLogs) capturedLogs = result.capturedLogs;
  if (result.downloadHistory) downloadHistory = result.downloadHistory;
  
  // Perform initial cleanup on startup
  setTimeout(performCleanup, 5000);
});

function performCleanup() {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  let changed = false;

  // 1. Clean downloadHistory (Deduplication)
  for (const [url, time] of Object.entries(downloadHistory)) {
    if (now - time > ONE_DAY) {
      delete downloadHistory[url];
      changed = true;
    }
  }

  // 2. Clean capturedMedia (Popup List) and files
  if (config.autoClean !== false) {
    const originalCount = capturedMedia.length;
    
    // We process items to be removed
    const itemsToRemove = capturedMedia.filter(item => (now - item.timestamp) > ONE_DAY);
    
    if (itemsToRemove.length > 0) {
      itemsToRemove.forEach(item => {
        if (item.downloadId) {
          // Attempt to delete physical file and record from browser history
          chrome.downloads.removeFile(item.downloadId).catch(() => {});
          chrome.downloads.erase({ id: item.downloadId }).catch(() => {});
        }
      });
      
      capturedMedia = capturedMedia.filter(item => (now - item.timestamp) <= ONE_DAY);
      changed = true;
    }
  }

  if (changed) {
    chrome.storage.local.set({ downloadHistory, capturedMedia });
    addLog(`Auto-clean performed: Removed records older than 24h.`);
  }
}

// Setup periodic cleanup alarm
chrome.alarms.create("cleanupAlarm", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanupAlarm") {
    performCleanup();
  }
});

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (!config.enabled) return;

    if (!details.responseHeaders) return;

    let contentLength = -1; // -1 means unknown (e.g., chunked transfer)
    let contentType = "";

    // Firefox uses lowercase header names in details.responseHeaders, Chrome can be either
    if (details.responseHeaders) {
      for (let header of details.responseHeaders) {
        if (!header || !header.name) continue;
        let name = header.name.toLowerCase();
        if (name === "content-length") {
          contentLength = parseInt(header.value, 10);
        }
        if (name === "content-type" && header.value) {
          contentType = header.value;
        }
      }
    }

    // addLog(`Inspecting HTTP response: ${details.url}`);
    // addLog(`Content-Type: ${contentType}, Content-Length: ${contentLength}`);

    if (config.nozerofiles && contentLength === 0) return;
    if (config.nosmallfiles && contentLength > 0) {
      const sizeKB = contentLength / 1024;
      if (sizeKB < config.minSize) return;
      if (config.maxSize > 0 && sizeKB > config.maxSize) return;
    }

    let matched = false;
    for (let rule of config.rules) {
      if (!rule.enabled) continue;

      try {
        let urlRegex = new RegExp(rule.url, "i");
        let ctRegex = new RegExp(rule.ct, "i");

        if (urlRegex.test(details.url) && ctRegex.test(contentType)) {
          addLog(`MATCHED RULE (url=${rule.url}, ct=${rule.ct}): ${details.url}`);
          matched = true;
          break;
        }
      } catch (e) {
        // Ignore invalid regex
        console.error("Invalid rule regex", e);
      }
    }

    if (matched) {
      addLog(`Capturing Media: ${contentType} ${contentLength} bytes -> ${details.url}`);
      // Check for duplicates
      let isDuplicate = capturedMedia.some(m => m.url === details.url);
      if (!isDuplicate) {
        let originalName = details.url.split('?')[0].split('/').pop() || "media_file";
        let baseName = originalName;

        // Generate date string for folder
        const d = new Date();
        const dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
        
        // Extract domain
        let domain = "unknown";
        try {
          const originUrl = details.initiator || details.documentUrl || details.url;
          domain = new URL(originUrl).hostname;
        } catch (e) {}

        // Find existing extension or generate one
        let ext = "";
        let finalFilename = "";
        if (baseName.includes('.')) {
          ext = baseName.substring(baseName.lastIndexOf('.'));
          baseName = baseName.substring(0, baseName.lastIndexOf('.'));
        } else {
          if (contentType.includes("video/mp4")) ext = ".mp4";
          else if (contentType.includes("video/webm")) ext = ".webm";
          else if (contentType.includes("audio/mpeg")) ext = ".mp3";
          else if (contentType.includes("audio/wav")) ext = ".wav";
          else if (contentType.includes("image/jpeg")) ext = ".jpg";
          else if (contentType.includes("image/png")) ext = ".png";
          else if (contentType.includes("image/gif")) ext = ".gif";
          else if (contentType.includes("image/webp")) ext = ".webp";
          else if (contentType.split('/')[1]) ext = "." + contentType.split('/')[1].split(';')[0];
        }

        finalFilename = `${baseName}${ext}`;

        let mediaItem = {
          id: Date.now() + "_" + Math.floor(Math.random() * 1000),
          url: details.url,
          filename: finalFilename,
          domain: domain,
          dateFolder: `FLX${dateStr}`,
          type: contentType,
          size: contentLength,
          timestamp: Date.now(),
          status: config.automaticdownload ? "Downloading" : "Ready"
        };

        capturedMedia.unshift(mediaItem);
        // Keep max 100 items
        if (capturedMedia.length > 100) {
          capturedMedia.pop();
        }

        addLog(chrome.i18n.getMessage("log_intercepted", [mediaItem.filename]));
        chrome.storage.local.set({ capturedMedia });


        if (config.automaticdownload) {
          addLog(`Auto-download triggered: ${mediaItem.filename}`);

          // Deduplication check
          const now = Date.now();
          const lastDownload = downloadHistory[mediaItem.url];
          const ONE_DAY = 24 * 60 * 60 * 1000;

          if (config.deduplicate && lastDownload && (now - lastDownload < ONE_DAY)) {
            addLog(chrome.i18n.getMessage("log_skipping"));
          } else {
            let safeFilename = mediaItem.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            if (!safeFilename || safeFilename === "_") safeFilename = "downloaded_media";

            // Use the new path structure: FLX{YYYY-MM-DD}/{domain}/{filename}
            const downloadPath = `${mediaItem.dateFolder}/${mediaItem.domain}/${safeFilename}`;

            chrome.downloads.download({
              url: mediaItem.url,
              filename: downloadPath,
              saveAs: false
            }).then((downloadId) => {
              downloadHistory[mediaItem.url] = now;
              mediaItem.downloadId = downloadId;

              // Trigger cleanup check
              performCleanup();
            }).catch(err => addLog(chrome.i18n.getMessage("log_failed", [err.message || err])));
          }
        }
      } else {
        addLog(chrome.i18n.getMessage("log_ignored_duplicate", [details.url]));
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// Allow popup to request logs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_LOGS") {
    sendResponse({ logs: capturedLogs });
  }
});
