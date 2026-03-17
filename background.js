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
  nozerofiles: true
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

function addLog(message) {
  const logStr = `[${new Date().toLocaleTimeString()}] ${message}`;
  console.log(logStr);
  capturedLogs.unshift(logStr);
  if (capturedLogs.length > 50) capturedLogs.pop();
  
  chrome.storage.local.set({ capturedLogs });
  chrome.runtime.sendMessage({ type: "NEW_LOG", output: logStr }).catch(() => {});
}

// Initialize captured media from storage on service worker start
chrome.storage.local.get(["capturedMedia", "capturedLogs"], (result) => {
  if (result.capturedMedia) capturedMedia = result.capturedMedia;
  if (result.capturedLogs) capturedLogs = result.capturedLogs;
});

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (!config.enabled) return;

    if (!details.responseHeaders) return;

    let contentLength = -1; // -1 means unknown (e.g., chunked transfer)
    let contentType = "";
    
    // Firefox uses lowercase header names in details.responseHeaders
    for (let header of details.responseHeaders) {
      let name = header.name.toLowerCase();
      if (name === "content-length") {
        contentLength = parseInt(header.value, 10);
      }
      if (name === "content-type") {
        contentType = header.value;
      }
    }

    // addLog(`Inspecting HTTP response: ${details.url}`);
    // addLog(`Content-Type: ${contentType}, Content-Length: ${contentLength}`);

    if (config.nozerofiles && contentLength === 0) return;
    if (config.nosmallfiles && contentLength > 0 && contentLength < 750000) return;

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
      } catch(e) {
        // Ignore invalid regex
        console.error("Invalid rule regex", e);
      }
    }

    if (matched) {
      addLog(`Capturing Media: ${contentType} ${contentLength} bytes -> ${details.url}`);
      // Check for duplicates
      let isDuplicate = capturedMedia.some(m => m.url === details.url);
      if (!isDuplicate) {
        let filename = details.url.split('?')[0].split('/').pop() || "media_file";
        let mediaItem = {
          id: Date.now() + "_" + Math.floor(Math.random() * 1000),
          url: details.url,
          filename: filename,
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
          addLog(`Auto-downloading: ${mediaItem.filename}`);
          
          let safeFilename = mediaItem.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          if (!safeFilename || safeFilename === "_") safeFilename = "downloaded_media";

          chrome.downloads.download({
            url: mediaItem.url,
            filename: safeFilename,
            saveAs: false
          }).catch(err => addLog(`Download failed: ${err.message || err}`));
        }
      } else {
        addLog(`Ignored duplicate: ${details.url}`);
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Allow popup to request logs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_LOGS") {
    sendResponse({ logs: capturedLogs });
  }
});
