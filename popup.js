document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('media-tbody');
  const emptyState = document.getElementById('empty-state');
  const mediaList = document.getElementById('media-list');
  const logsContainer = document.getElementById('logs-container');

  // ── Logging ──────────────────────────────────────────────────────────────
  function addLogToUI(logStr) {
    if (!debugPolling && logStr.includes('[DEBUG]')) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = logStr;
    logsContainer.prepend(div);
  }

  function renderLogs(logs) {
    logsContainer.innerHTML = '';
    const filtered = debugPolling ? logs : logs.filter(l => !l.includes('[DEBUG]'));
    filtered.forEach(log => {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = log;
      logsContainer.appendChild(div);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  /** Applies the correct class + label + disabled state to an action button based on item status */
  function applyBtnState(btn, status) {
    btn.classList.remove('open-btn', 'downloading-btn', 'deleted-btn');
    btn.disabled = false;

    // Also handle sister merge-btn if present
    const row = btn.closest('tr');
    const mergeBtn = row ? row.querySelector('.merge-btn') : null;
    if (mergeBtn) mergeBtn.disabled = false;

    switch (status) {
      case 'Complete':
        btn.textContent = chrome.i18n.getMessage('btn_open') || 'Open';
        btn.classList.add('open-btn');
        break;
      case 'Downloading':
        btn.textContent = chrome.i18n.getMessage('btn_downloading') || 'Downloading';
        btn.classList.add('downloading-btn');
        btn.disabled = true;
        if (mergeBtn) mergeBtn.disabled = true;
        break;
      case 'Deleted':
        btn.textContent = chrome.i18n.getMessage('btn_deleted') || 'Deleted';
        btn.classList.add('deleted-btn');
        btn.disabled = true;
        if (mergeBtn) mergeBtn.disabled = true;
        break;
      default: // 'Ready' or anything else
        btn.textContent = chrome.i18n.getMessage('btn_download') || 'Download';
        break;
    }
  }

  /** Updates the Merge button label/state for m3u8 items based on item status. */
  function applyMergeBtnState(btn, item) {
    btn.classList.remove('merged-btn', 'merging-btn');
    btn.disabled = false;
    const status = item.status || 'Ready';
    if (status === 'Complete' && item.muxedDownloadId) {
      btn.textContent = chrome.i18n.getMessage('btn_merged') || 'Merged';
      btn.classList.add('merged-btn');
      btn.title = 'Click to reveal master.mp4';
    } else if (['Muxing\u2026', 'Muxing...', 'Merging\u2026', 'Downloading'].includes(status)) {
      btn.textContent = status === 'Downloading' ? 'Merging\u2026' : status;
      btn.classList.add('merging-btn');
      btn.disabled = true;
    } else {
      btn.textContent = chrome.i18n.getMessage('btn_merge') || 'Merge';
    }
  }

  // Status progression — must only move forward, never backward
  const STATUS_ORDER = { 'Ready': 0, 'Downloading': 1, 'Complete': 2 };


  /** Checks actual download state via chrome.downloads API and corrects stored status / button */
  function checkDownloadStatus(downloadId, itemId) {
    chrome.downloads.search({ id: downloadId }, (results) => {
      if (!results || !results[0]) return;
      const download = results[0];

      let newStatus = null;
      if (download.state === 'complete') {
        newStatus = 'Complete';
      } else if (download.state === 'in_progress') {
        newStatus = 'Downloading';
      } else if (download.state === 'interrupted') {
        newStatus = 'Ready';
      }

      if (!newStatus) return;

      // Only update if it's a forward progression
      chrome.storage.local.get(['capturedMedia'], (result) => {
        const media = result.capturedMedia || [];
        const item = media.find(m => m.id === itemId);
        if (!item) return;

        const currentOrder = STATUS_ORDER[item.status] ?? 0;
        const newOrder = STATUS_ORDER[newStatus] ?? 0;

        // Allow 'Ready' (retry) only if truly interrupted; block all other regressions
        if (newOrder < currentOrder) return;
        if (newOrder === currentOrder) return; // no change needed

        item.status = newStatus;
        const btn = document.getElementById(`btn-${itemId}`);
        if (btn) applyBtnState(btn, newStatus);
        chrome.storage.local.set({ capturedMedia: media });
      });
    });
  }

  // ── List Rendering ────────────────────────────────────────────────────────
  let lastRenderedJson = '';
  function renderList(items) {
    if (!items) items = [];

    // Quick performance check: if data hasn't changed, don't rebuild DOM
    const currentJson = JSON.stringify(items.map(m => ({ id: m.id, url: m.url, status: m.status, muxedDownloadId: m.muxedDownloadId })));
    if (currentJson === lastRenderedJson) return;
    lastRenderedJson = currentJson;

    tbody.innerHTML = '';

    if (items && items.length > 0) {
      emptyState.classList.add('hidden');
      mediaList.classList.remove('hidden');

      items.forEach(item => {
        const displayBadge = item.streamType || item.tag;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div class="filename-container">
              <span class="filename" title="${item.url}">${item.filename}</span>
              ${displayBadge ? `<span class="badge badge-${displayBadge}">${displayBadge.toUpperCase()}</span>` : ''}
            </div>
          </td>
          <td class="type">${(item.type || '').split(';')[0]}</td>
          <td>${formatBytes(item.size)}</td>
          <td>
            <div class="btn-group">
              <button class="action-btn" id="btn-${item.id}"
                data-id="${item.id}"
                data-url="${item.url}"
                data-filename="${item.filename}">
                ${chrome.i18n.getMessage('btn_download') || 'Download'}
              </button>
              ${item.pluginType === 'm3u8' ? `
                <button class="action-btn merge-btn" 
                  id="merge-btn-${item.id}"
                  data-id="${item.id}" 
                  title="${chrome.i18n.getMessage('btn_merge') || 'Merge'}">
                  ${chrome.i18n.getMessage('btn_merge') || 'Merge'}
                </button>
              ` : ''}
            </div>
          </td>
        `;
        tbody.appendChild(tr);

        // Set button states from stored status
        const btn = document.getElementById(`btn-${item.id}`);
        if (btn) applyBtnState(btn, item.status || 'Ready');
        const mergeBtn = document.getElementById(`merge-btn-${item.id}`);
        if (mergeBtn) applyMergeBtnState(mergeBtn, item);
      });

      // Use event delegation for better performance
      if (!tbody.dataset.listenerAttached) {
        tbody.addEventListener('click', (e) => {
          const btn = e.target.closest('.action-btn');
          if (!btn) return;

          const id = btn.getAttribute('data-id');

          if (btn.classList.contains('merge-btn')) {
            // If already merged, show the file in Finder
            if (btn.classList.contains('merged-btn')) {
              chrome.storage.local.get(['capturedMedia'], (result) => {
                const media = result.capturedMedia || [];
                const item = media.find(m => m.id === id);
                if (item && item.muxedDownloadId) chrome.downloads.show(item.muxedDownloadId);
              });
              return;
            }
            // Otherwise trigger the merge
            chrome.runtime.sendMessage({
              type: 'TRIGGER_PLUGIN_ACTION',
              pluginName: 'M3U8 Downloader',
              action: 'merge',
              itemId: id
            });
            btn.disabled = true;
            btn.textContent = 'Merging…';
            return;
          }

          chrome.storage.local.get(['capturedMedia'], (result) => {
            const media = result.capturedMedia || [];
            const item = media.find(m => m.id === id);
            if (!item) return;

            const currentStatus = item.status || 'Ready';

            if (currentStatus === 'Complete') {
              if (item.downloadId) {
                chrome.downloads.show(item.downloadId);
              }
            } else if (currentStatus === 'Ready' || currentStatus === 'interrupted') {
              const url = btn.getAttribute('data-url');
              const filename = btn.getAttribute('data-filename');
              let downloadPath = filename;
              if (item.dateFolder && item.domain) {
                downloadPath = `${item.dateFolder}/${item.domain}/${filename}`;
              }

              // Android compatibility: Strip folders
              const isAndroid = /Android/i.test(navigator.userAgent);
              if (isAndroid) {
                downloadPath = filename.split('/').pop();
              }

              item.status = 'Downloading';
              chrome.storage.local.set({ capturedMedia: media });
              applyBtnState(btn, 'Downloading');

              chrome.downloads.download({
                url: url,
                filename: downloadPath,
                saveAs: false
              }, (downloadId) => {
                const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
                if (err) {
                  console.error('Download failed:', err);
                  item.status = 'Ready';
                  chrome.storage.local.set({ capturedMedia: media });
                  applyBtnState(btn, 'Ready');
                } else {
                  item.downloadId = downloadId;
                  chrome.storage.local.set({ capturedMedia: media });
                }
              });
            }
          });
        });
        tbody.dataset.listenerAttached = 'true';
      }
    } else {
      emptyState.classList.remove('hidden');
      mediaList.classList.add('hidden');
    }
  }

  // ── Initial Data Load ─────────────────────────────────────────────────────
  chrome.storage.local.get(['capturedMedia'], (result) => {
    renderList(result.capturedMedia || []);
  });

  // Logs
  chrome.runtime.sendMessage({ type: "GET_LOGS" }, (response) => {
    if (chrome.runtime.lastError) { return; }
    if (response && response.logs) { renderLogs(response.logs); }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "NEW_LOG") { addLogToUI(message.output); }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.capturedMedia) {
      renderList(changes.capturedMedia.newValue);
    }
  });

  // ── 1-second polling for active downloads ─────────────────────────────────
  const POLL_INTERVAL_MS = 1000;
  let debugPolling = false;
  const debugChk = document.getElementById('debug-polling-chk');

  chrome.storage.local.get(['debugPolling'], (result) => {
    debugPolling = !!result.debugPolling;
    if (debugChk) debugChk.checked = debugPolling;
  });

  if (debugChk) {
    debugChk.addEventListener('change', () => {
      debugPolling = debugChk.checked;
      chrome.storage.local.set({ debugPolling });
      addLogToUI(`Debug polling: ${debugPolling ? 'ON' : 'OFF'}`);
      
      // Re-fetch and re-render logs to apply the new filter
      chrome.runtime.sendMessage({ type: "GET_LOGS" }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.logs) renderLogs(response.logs);
      });
    });
  }

  function pollDownloadStatus() {
    chrome.storage.local.get(['capturedMedia'], (result) => {
      const media = result.capturedMedia || [];
      const downloading = media.filter(m => m.status === 'Downloading');

      if (downloading.length === 0) return;

      if (debugPolling) {
        addLogToUI(`Polling ${downloading.length} downloading items...`);
      }

      downloading.forEach(item => {
        if (!item.downloadId) {
          if (debugPolling) addLogToUI(`Item ${item.filename} has no downloadId yet.`);
          return;
        }

        chrome.downloads.search({ id: item.downloadId }, (results) => {
          if (debugPolling) {
            const found = (results && results[0]) ? `found (state=${results[0].state})` : 'NOT found';
            addLogToUI(`Search ID ${item.downloadId} (${item.filename}): ${found}`);
          }

          if (results && results[0]) {
            const dl = results[0];
            let newStatus = null;
            if (dl.state === 'complete') {
              newStatus = 'Complete';
            } else if (dl.state === 'interrupted') {
              newStatus = 'Ready';
            }

            if (newStatus && newStatus !== item.status) {
              const currentOrder = STATUS_ORDER[item.status] ?? 0;
              const newOrder = STATUS_ORDER[newStatus] ?? 0;
              if (newOrder > currentOrder) {
                if (debugPolling) addLogToUI(`Status change: ${item.filename} -> ${newStatus}`);
                updateItemStatusAtomically(item.id, newStatus);
              }
            }
          }
        });
      });
    });
  }

  function updateItemStatusAtomically(itemId, newStatus) {
    chrome.storage.local.get(['capturedMedia'], (freshResult) => {
      const freshMedia = freshResult.capturedMedia || [];
      const target = freshMedia.find(m => m.id === itemId);
      if (target && target.status !== newStatus) {
        target.status = newStatus;
        chrome.storage.local.set({ capturedMedia: freshMedia });
      }
    });
  }

  // Start poll — runs every 1s while popup is open
  pollDownloadStatus(); 
  const pollTimer = setInterval(pollDownloadStatus, POLL_INTERVAL_MS);
  
  window.addEventListener('unload', () => clearInterval(pollTimer));

  // ── Toolbar Buttons ───────────────────────────────────────────────────────
  document.getElementById('clear-btn').addEventListener('click', () => {
    chrome.storage.local.set({ capturedMedia: [] }, () => renderList([]));
  });

  document.getElementById('download-all-btn').addEventListener('click', () => {
    chrome.storage.local.get(['capturedMedia'], (result) => {
      const items = result.capturedMedia || [];
      items.forEach(item => {
        if (item.status === 'Complete' || item.status === 'Downloading') return;
        let downloadPath = item.filename;
        if (item.dateFolder && item.domain) {
          downloadPath = `${item.dateFolder}/${item.domain}/${item.filename}`;
        }
        chrome.downloads.download({ url: item.url, filename: downloadPath, saveAs: false });
      });
    });
  });

  document.getElementById('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('clear-logs-btn').addEventListener('click', () => {
    chrome.storage.local.set({ capturedLogs: [] }, () => renderLogs([]));
  });

  // ── Popout ────────────────────────────────────────────────────────────────
  // Detect popout mode via query parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'popout') {
    document.body.classList.add('is-popout');
    const popoutBtn = document.getElementById('popout-btn');
    if (popoutBtn) popoutBtn.style.display = 'none';
  }

  document.getElementById('popout-btn').addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?mode=popout'),
      type: 'popup',
      width: 800,
      height: 650
    });
    // Close the toolbar popup
    window.close();
  });
});
