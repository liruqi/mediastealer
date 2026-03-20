document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('media-tbody');
  const emptyState = document.getElementById('empty-state');
  const mediaList = document.getElementById('media-list');
  const logsContainer = document.getElementById('logs-container');

  // ── Logging ──────────────────────────────────────────────────────────────
  function addLogToUI(logStr) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = logStr;
    logsContainer.prepend(div);
  }

  function renderLogs(logs) {
    logsContainer.innerHTML = '';
    logs.forEach(log => {
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

    switch (status) {
      case 'Complete':
        btn.textContent = chrome.i18n.getMessage('btn_open') || 'Open';
        btn.classList.add('open-btn');
        break;
      case 'Downloading':
        btn.textContent = chrome.i18n.getMessage('btn_downloading') || 'Downloading';
        btn.classList.add('downloading-btn');
        btn.disabled = true;
        break;
      case 'Deleted':
        btn.textContent = chrome.i18n.getMessage('btn_deleted') || 'Deleted';
        btn.classList.add('deleted-btn');
        btn.disabled = true;
        break;
      default: // 'Ready' or anything else
        btn.textContent = chrome.i18n.getMessage('btn_download') || 'Download';
        break;
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
    const currentJson = JSON.stringify(items.map(m => ({id: m.id, url: m.url, status: m.status})));
    if (currentJson === lastRenderedJson) return;
    lastRenderedJson = currentJson;

    tbody.innerHTML = '';

    if (items && items.length > 0) {
      emptyState.classList.add('hidden');
      mediaList.classList.remove('hidden');

      items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <span class="filename" title="${item.url}">${item.filename}</span>
          </td>
          <td class="type">${(item.type || '').split(';')[0]}</td>
          <td>${formatBytes(item.size)}</td>
          <td>
            <button class="action-btn" id="btn-${item.id}"
              data-id="${item.id}"
              data-url="${item.url}"
              data-filename="${item.filename}">
              ${chrome.i18n.getMessage('btn_download') || 'Download'}
            </button>
          </td>
        `;
        tbody.appendChild(tr);

        // Set button to correct state from stored status
        const btn = document.getElementById(`btn-${item.id}`);
        if (btn) {
          applyBtnState(btn, item.status || 'Ready');
        }

        // NOTE: status polling handles updates — no per-render check needed
      });

      // Use event delegation for better performance
      if (!tbody.dataset.listenerAttached) {
        tbody.addEventListener('click', (e) => {
          const btn = e.target.closest('.action-btn');
          if (!btn) return;

          const id = btn.getAttribute('data-id');
          const url = btn.getAttribute('data-url');
          const filename = btn.getAttribute('data-filename');

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
              let downloadPath = filename;
              if (item.dateFolder && item.domain) {
                downloadPath = `${item.dateFolder}/${item.domain}/${filename}`;
              }

              item.status = 'Downloading';
              chrome.storage.local.set({ capturedMedia: media });
              applyBtnState(btn, 'Downloading');

              chrome.downloads.download({
                url: url,
                filename: downloadPath,
                saveAs: false
              }).then(downloadId => {
                item.downloadId = downloadId;
                chrome.storage.local.set({ capturedMedia: media });
              }).catch(() => {
                item.status = 'Ready';
                chrome.storage.local.set({ capturedMedia: media });
                applyBtnState(btn, 'Ready');
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

  // ── 3-second polling for active downloads ─────────────────────────────────
  // Only checks items with status 'Downloading'. Stops automatically when none remain.
  const POLL_INTERVAL_MS = 3000;

  function pollDownloadStatus() {
    chrome.storage.local.get(['capturedMedia'], (result) => {
      const media = result.capturedMedia || [];
      const downloading = media.filter(m => m.status === 'Downloading' && m.downloadId);

      if (downloading.length === 0) return;

      let updates = [];
      let pending = downloading.length;

      downloading.forEach(item => {
        chrome.downloads.search({ id: item.downloadId }, (results) => {
          pending--;
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
                updates.push({ id: item.id, status: newStatus });
              }
            }
          }

          if (pending === 0 && updates.length > 0) {
            // Apply updates atomically to current storage
            chrome.storage.local.get(['capturedMedia'], (freshResult) => {
              const freshMedia = freshResult.capturedMedia || [];
              let changed = false;
              updates.forEach(upd => {
                const item = freshMedia.find(m => m.id === upd.id);
                if (item && item.status !== upd.status) {
                  item.status = upd.status;
                  changed = true;
                  // Update UI immediately if button exists
                  const btn = document.getElementById(`btn-${upd.id}`);
                  if (btn) applyBtnState(btn, upd.status);
                }
              });
              if (changed) {
                chrome.storage.local.set({ capturedMedia: freshMedia });
              }
            });
          }
        });
      });
    });
  }

  // Start poll — runs every 3s while popup is open
  const pollTimer = setInterval(pollDownloadStatus, POLL_INTERVAL_MS);
  // Clean up on unload
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
