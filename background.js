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
  minSize: 800,
  maxSize: 0
};

chrome.storage.local.get(["config"], (result) => {
  if (result.config) {
    config = { ...config, ...result.config };
  } else {
    chrome.storage.local.set({ config });
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

        // Generate timestamp
        const d = new Date();
        const pfx = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + "_" +
          String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');

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

        finalFilename = `${pfx}_${baseName}${ext}`;

        let mediaItem = {
          id: Date.now() + "_" + Math.floor(Math.random() * 1000),
          url: details.url,
          filename: finalFilename,
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

        chrome.storage.local.set({ capturedMedia });


        if (config.automaticdownload) {
          addLog(`Auto-download triggered: ${mediaItem.filename}`);

          // Deduplication check
          const now = Date.now();
          const lastDownload = downloadHistory[mediaItem.url];
          const ONE_DAY = 24 * 60 * 60 * 1000;

          if (config.deduplicate && lastDownload && (now - lastDownload < ONE_DAY)) {
            addLog(`Skipping download: Already downloaded in the last 24 hours.`);
          } else {
            let safeFilename = mediaItem.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            if (!safeFilename || safeFilename === "_") safeFilename = "downloaded_media";

            chrome.downloads.download({
              url: mediaItem.url,
              filename: safeFilename,
              saveAs: false
            }).then((downloadId) => {
              downloadHistory[mediaItem.url] = now;
              mediaItem.downloadId = downloadId;

              // Clean up history (remove entries older than 24h)
              for (const [url, time] of Object.entries(downloadHistory)) {
                if (now - time > ONE_DAY) delete downloadHistory[url];
              }
              chrome.storage.local.set({ downloadHistory, capturedMedia });
            }).catch(err => addLog(`Download failed: ${err.message || err}`));
          }
        }
      } else {
        addLog(`Ignored duplicate: ${details.url}`);
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
