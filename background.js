// Chrome (service worker): load dependencies via importScripts.
// Firefox (event page via manifest "scripts" array): files are already loaded in order, importScripts is unavailable.
if (typeof importScripts !== 'undefined') {
  importScripts('media-db.js', 'plugin-engine.js', 'plugins/m3u8-plugin.js');
}

const defaultRules = [
  { id: 1, enabled: true, url: ".*", ct: "video/.*", tag: "video", rtype: 1 },
  { id: 2, enabled: true, url: ".*", ct: "audio/.*", tag: "audio", rtype: 2 },
  { id: 3, enabled: true, url: ".*", ct: "application/x-shockwave-flash", tag: "video", rtype: 3 },
  { id: 4, enabled: true, url: ".*", ct: "image/.*", tag: "image", rtype: 4 }
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
  maxSize: 0,
  ignoredExtensions: [".gif", ".svg", ".ico"]
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
    // Keep in-memory capturedMedia in sync with storage.
    // Without this, background.js would overwrite statuses set by the popup
    // (e.g. 'Complete') with stale in-memory values on the next capture event.
    if (changes.capturedMedia && changes.capturedMedia.newValue) {
      capturedMedia = changes.capturedMedia.newValue;
      capturedUrls = new Set(capturedMedia.map(m => m.url));
    }
  }
});

let capturedMedia = [];
let capturedLogs = [];
let downloadHistory = {}; // { url: timestamp }
let capturedUrls = new Set(); // For faster deduplication lookups

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
  if (result.capturedMedia) {
    capturedMedia = result.capturedMedia;
    capturedUrls = new Set(capturedMedia.map(m => m.url));
  }
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
          chrome.downloads.removeFile(item.downloadId).catch(() => { });
          chrome.downloads.erase({ id: item.downloadId }).catch(() => { });
        }
      });

      capturedMedia = capturedMedia.filter(item => (now - item.timestamp) <= ONE_DAY);
      capturedUrls = new Set(capturedMedia.map(m => m.url));
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
  async function (details) {
    // [FIREFOX DEBUG] Very loud log to see if it fires
    console.error(`[FLUXON] onHeadersReceived fired for: ${details.url}`);
    
    if (!config.enabled) return;

    // Skip requests initiated by the extension itself
    const origin = details.initiator || details.originUrl || details.documentUrl || '';
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
      return;
    }

    if (!details.responseHeaders) {
      console.log(`[DEBUG] No response headers for: ${details.url}`);
      return;
    }

    let contentLength = -1; // -1 means unknown (e.g., chunked transfer)
    let contentType = "";

    // Firefox uses lowercase header names in details.responseHeaders, Chrome can be either
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

    // [DEBUG LOG]
    addLog(`[DEBUG] Headers: ${contentType} (${contentLength}) for ${details.url.substring(0, 50)}...`);

    // Plugin Interception Hook
    const pluginResult = await self.pluginEngine.executeHook('onIntercept', { details, contentType, config });
    if (pluginResult.skip) {
      addLog(`[DEBUG] Plugin skip: ${details.url.substring(0, 50)}...`);
      return;
    }

    if (!pluginResult.ignoreSize) {
      if (config.nozerofiles && contentLength === 0) {
        return;
      }
      if (config.nosmallfiles && contentLength > 0) {
        const sizeKB = contentLength / 1024;
        if (sizeKB < config.minSize) {
          addLog(`[DEBUG] Too small skip (${sizeKB.toFixed(1)}KB): ${details.url.substring(0, 50)}...`);
          return;
        }
        if (config.maxSize > 0 && sizeKB > config.maxSize) {
          addLog(`[DEBUG] Too large skip (${sizeKB.toFixed(1)}KB): ${details.url.substring(0, 50)}...`);
          return;
        }
      }
    }

    let matched = false;
    let matchedTag = '';

    if (pluginResult.isPluginHandled) {
      matched = true;
      matchedTag = pluginResult.tag || '';
    } else {
      for (let rule of config.rules) {
        if (!rule.enabled) continue;

        try {
          let urlRegex = new RegExp(rule.url, "i");
          let ctRegex = new RegExp(rule.ct, "i");

          if (urlRegex.test(details.url) && ctRegex.test(contentType)) {
            addLog(`MATCHED RULE (url=${rule.url}, ct=${rule.ct}): ${details.url.substring(0, 50)}...`);
            matched = true;
            matchedTag = rule.tag || '';
            break;
          }
        } catch (e) {
          // Ignore invalid regex
          console.error("Invalid rule regex", e);
        }
      }
    }

    if (matched) {
      addLog(`Capturing Media: ${contentType} ${contentLength} bytes -> ${details.url}`);
      // Check for duplicates — now using a Set for performance
      if (!capturedUrls.has(details.url)) {
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
        } catch (e) { }

        // Find existing extension or generate one
        let ext = "";
        if (baseName.includes('.')) {
          ext = baseName.substring(baseName.lastIndexOf('.')).toLowerCase();
        } else {
          if (contentType.includes("video/mp4")) ext = ".mp4";
          else if (contentType.includes("video/webm")) ext = ".webm";
          else if (contentType.includes("audio/mpeg")) ext = ".mp3";
          else if (contentType.includes("audio/wav")) ext = ".wav";
          else if (contentType.includes("image/jpeg")) ext = ".jpg";
          else if (contentType.includes("image/png")) ext = ".png";
          else if (contentType.includes("image/gif")) ext = ".gif";
          else if (contentType.includes("image/webp")) ext = ".webp";
          else if (contentType.split('/')[1]) ext = "." + contentType.split('/')[1].split(';')[0].toLowerCase();
        }

        // Check against ignored extensions
        if (config.ignoredExtensions && config.ignoredExtensions.includes(ext)) {
          addLog(`Ignoring extension: ${ext} for ${details.url}`);
          return;
        }

        let finalFilename = "";
        if (baseName.includes('.')) {
          finalFilename = baseName; // already contains extension
          baseName = baseName.substring(0, baseName.lastIndexOf('.'));
        } else {
          finalFilename = `${baseName}${ext}`;
        }

        let mediaItem = {
          id: Date.now() + "_" + Math.floor(Math.random() * 1000),
          url: details.url,
          filename: finalFilename,
          domain: domain,
          dateFolder: `FLX${dateStr}`,
          type: contentType,
          size: contentLength,
          timestamp: Date.now(),
          status: 'Ready',
          tag: typeof matchedTag !== 'undefined' ? matchedTag : '',
          pluginType: pluginResult.type || 'generic',
          streamType: pluginResult.streamType || null
        };

        if (config.automaticdownload) {
          mediaItem.status = 'Downloading';
        }

        // Handle Auto-download OR Plugin Download OR just Manual Ready
        const handleCapture = async () => {
          // 4. Plugin Download Hook
          const preDownloadResult = await self.pluginEngine.executeHook('onPreDownload', { item: mediaItem, config });

          if (preDownloadResult.handled) {
            mediaItem.status = 'Complete';
            if (preDownloadResult.downloadId) mediaItem.downloadId = preDownloadResult.downloadId;
          } else if (config.automaticdownload) {
            // Initiate download BEFORE saving to storage to ensure we have the ID
            const downloadResult = await startDownload(mediaItem);
            if (downloadResult.success) {
              mediaItem.status = 'Downloading';
              mediaItem.downloadId = downloadResult.downloadId;
              downloadHistory[mediaItem.url] = Date.now();
            }
          }

          // 5. Save to storage
          chrome.storage.local.get(['capturedMedia'], (stored) => {
            const freshMedia = stored.capturedMedia || [];
            // Re-check for duplicates just in case
            if (!freshMedia.find(m => m.url === mediaItem.url)) {
              freshMedia.unshift(mediaItem);
              if (freshMedia.length > 100) freshMedia.pop();
              capturedMedia = freshMedia;
              chrome.storage.local.set({ capturedMedia: freshMedia });
              if (mediaItem.downloadId) {
                addLog(`Media captured & download started: ${mediaItem.filename}`);
              } else {
                addLog(chrome.i18n.getMessage("log_intercepted", [mediaItem.filename]));
              }
            }
          });
        };

        handleCapture();
      }
    }
  },
  { urls: ["<all_urls>"] },
  // "extraHeaders" is Chrome-only; omitting it keeps the listener working on Firefox
  ["responseHeaders"]
);

async function startDownload(mediaItem) {
  try {
    const lastDownload = downloadHistory[mediaItem.url];
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (config.deduplicate && lastDownload && (Date.now() - lastDownload < ONE_DAY)) {
      addLog(chrome.i18n.getMessage("log_skipping"));
      return { success: false };
    }

    let safeFilename = mediaItem.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    if (!safeFilename || safeFilename === "_") safeFilename = "downloaded_media";
    const downloadPath = `${mediaItem.dateFolder}/${mediaItem.domain}/${safeFilename}`;

    const downloadId = await chrome.downloads.download({
      url: mediaItem.url,
      filename: downloadPath,
      saveAs: false
    });

    return { success: true, downloadId };
  } catch (err) {
    addLog(chrome.i18n.getMessage("log_failed", [err.message || err]));
    return { success: false };
  }
}

function updateItemStatus(itemId, status, downloadId, muxedDownloadId) {
  chrome.storage.local.get(['capturedMedia'], (result) => {
    const media = result.capturedMedia || [];
    const item = media.find(m => m.id === itemId);
    if (item) {
      item.status = status;
      if (downloadId) item.downloadId = downloadId;
      if (muxedDownloadId) item.muxedDownloadId = muxedDownloadId;
      chrome.storage.local.set({ capturedMedia: media });
    }
  });
}

// Message Listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_LOGS") {
    sendResponse({ logs: capturedLogs });
  } else if (message.type === "MERGE_PROGRESS") {
    const { filename, current, total, status } = message.data;
    if (status) {
      addLog(status);
    } else {
      addLog(`Merging ${filename}: ${current}/${total} fragments...`);
    }
  } else if (message.type === "DOWNLOAD_INTERNAL") {
    const { url, filename, showFile } = message.data;
    const relativePath = filename.replace(/\\/g, '/');
    chrome.downloads.search({ state: 'complete' }, (results) => {
      const existing = results.find(item => {
        const itemPath = item.filename.replace(/\\/g, '/');
        // Check if path matches AND file still exists on disk
        return itemPath.endsWith(relativePath) && item.exists !== false;
      });

      if (existing) {
        addLog(`File already exists, skipping download: ${filename} (at ${existing.filename})`);
        sendResponse({ success: true, downloadId: existing.id, wasSkipped: true });
        return;
      }

      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        if (err) {
          addLog(`Download trigger failed for ${filename}: ${err}`);
        }
        if (downloadId && !err && showFile) {
          chrome.downloads.show(downloadId);
        }
        sendResponse({ success: !err, downloadId, error: err });
      });
    });
    return true; // Keep channel open for async callback
  } else if (message.type === "WAIT_FOR_DOWNLOAD") {
    const { downloadId } = message.data;

    // Check current state first (it might be already complete if skipped)
    chrome.downloads.search({ id: downloadId }, (results) => {
      const current = results && results[0];
      if (current && (current.state === 'complete' || current.state === 'interrupted')) {
        sendResponse({ state: current.state });
        return;
      }

      const checkStatus = (delta) => {
        if (delta.id === downloadId && delta.state) {
          if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(checkStatus);
            sendResponse({ state: delta.state.current });
          }
        }
      };
      chrome.downloads.onChanged.addListener(checkStatus);
    });
    return true;
  } else if (message.type === "UPDATE_ITEM_STATUS") {
    const { itemId, status, downloadId, muxedDownloadId } = message.data;
    updateItemStatus(itemId, status, downloadId, muxedDownloadId);
  } else if (message.type === "TRIGGER_PLUGIN_ACTION") {
    const { pluginName, action, itemId } = message;
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {};
      self.pluginEngine.executeHook('onAction', { pluginName, action, itemId, config });
    });
  } else if (message.type === "GET_PLUGINS") {
    sendResponse({ plugins: self.pluginEngine.getPlugins() });
  }
});
