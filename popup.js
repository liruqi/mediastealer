document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('media-tbody');
  const emptyState = document.getElementById('empty-state');
  const mediaList = document.getElementById('media-list');

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

  document.getElementById('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
