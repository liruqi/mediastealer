document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('media-tbody');
  const emptyState = document.getElementById('empty-state');
  const mediaList = document.getElementById('media-list');
  const logsContainer = document.getElementById('logs-container');

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

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function renderList(items) {
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
          <td class="type">${item.type.split(';')[0]}</td>
          <td>${formatBytes(item.size)}</td>
          <td>
            <button class="action-btn" data-url="${item.url}" data-filename="${item.filename}">Download</button>
          </td>
        `;
        
        tbody.appendChild(tr);
      });

      // Add click listeners to download buttons
      document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const url = e.target.getAttribute('data-url');
          const filename = e.target.getAttribute('data-filename');
          chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
          });
        });
      });
    } else {
      emptyState.classList.remove('hidden');
      mediaList.classList.add('hidden');
    }
  }

  // Load initial data
  chrome.storage.local.get(['capturedMedia'], (result) => {
    renderList(result.capturedMedia || []);
  });

  // Load initial logs
  chrome.runtime.sendMessage({ type: "GET_LOGS" }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("Background script not ready or asleep:", chrome.runtime.lastError);
      return;
    }
    if (response && response.logs) {
      renderLogs(response.logs);
    }
  });

  // Listen for real-time logs from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "NEW_LOG") {
      addLogToUI(message.output);
    }
  });

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.capturedMedia) {
      renderList(changes.capturedMedia.newValue);
    }
  });

  // Buttons
  document.getElementById('clear-btn').addEventListener('click', () => {
    chrome.storage.local.set({ capturedMedia: [] }, () => {
      renderList([]);
    });
  });

  document.getElementById('download-all-btn').addEventListener('click', () => {
    chrome.storage.local.get(['capturedMedia'], (result) => {
      const items = result.capturedMedia || [];
      items.forEach(item => {
        chrome.downloads.download({
          url: item.url,
          filename: item.filename,
          saveAs: false
        });
      });
    });
  });

  document.getElementById('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('clear-logs-btn').addEventListener('click', () => {
    chrome.storage.local.set({ capturedLogs: [] }, () => {
      renderLogs([]);
    });
  });

  document.getElementById('popout-btn').addEventListener('click', () => {
    document.windows_create_pending = true;
    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: 520,
    }, () => {
      window.close(); // Close the current flyout after the new one opens
    });
  });
});
