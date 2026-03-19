document.addEventListener('DOMContentLoaded', () => {
  const enabledInput = document.getElementById('enabled');
  const autoDownloadInput = document.getElementById('automaticdownload');
  const noSmallFilesInput = document.getElementById('nosmallfiles');
  const noZeroFilesInput = document.getElementById('nozerofiles');
  const deduplicateInput = document.getElementById('deduplicate');
  const minSizeInput = document.getElementById('minSize');
  const maxSizeInput = document.getElementById('maxSize');
  const sizeRangeConfig = document.getElementById('size-range-config');
  const rulesTableBody = document.querySelector('#rules-table tbody');
  const addRuleBtn = document.getElementById('add-rule-btn');

  let currentConfig = {};

  const defaultRules = [
    { id: 1, enabled: true, url: ".*", ct: "video/.*", rtype: 1 },
    { id: 2, enabled: true, url: ".*", ct: "audio/.*", rtype: 2 },
    { id: 3, enabled: true, url: ".*", ct: "application/x-shockwave-flash", rtype: 3 }
  ];

  // Load configuration from storage
  function loadConfig() {
    chrome.storage.local.get(['config'], (result) => {
      currentConfig = result.config || {
        enabled: true,
        rules: defaultRules,
        automaticdownload: false,
        nosmallfiles: true,
        nozerofiles: true,
        deduplicate: true,
        minSize: 800,
        maxSize: 0
      };

      enabledInput.checked = currentConfig.enabled;
      autoDownloadInput.checked = currentConfig.automaticdownload;
      noSmallFilesInput.checked = currentConfig.nosmallfiles;
      noZeroFilesInput.checked = currentConfig.nozerofiles;
      deduplicateInput.checked = currentConfig.deduplicate;
      minSizeInput.value = currentConfig.minSize || 800;
      maxSizeInput.value = currentConfig.maxSize || 0;

      toggleSizeRangeVisibility();
      renderRules(currentConfig.rules);
    });
  }

  // Render rules table
  function renderRules(rules) {
    rulesTableBody.innerHTML = '';
    rules.forEach((rule, index) => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="rule-enable" data-index="${index}" ${rule.enabled ? 'checked' : ''}>
        </td>
        <td>
          <input type="text" value="${rule.url}" style="width: 100%; box-sizing: border-box;" class="rule-url" data-index="${index}">
        </td>
        <td>
          <input type="text" value="${rule.ct}" style="width: 100%; box-sizing: border-box;" class="rule-ct" data-index="${index}">
        </td>
        <td>
          <button class="delete-rule danger" data-index="${index}" data-i18n="btn_delete">${chrome.i18n.getMessage('btn_delete')}</button>
        </td>
      `;
      rulesTableBody.appendChild(tr);
    });

    // Event listeners for rule inputs
    document.querySelectorAll('.rule-enable').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentConfig.rules[idx].enabled = e.target.checked;
        saveConfigSilently();
      });
    });

    document.querySelectorAll('.rule-url').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentConfig.rules[idx].url = e.target.value;
        saveConfigSilently();
      });
    });

    document.querySelectorAll('.rule-ct').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentConfig.rules[idx].ct = e.target.value;
        saveConfigSilently();
      });
    });

    document.querySelectorAll('.delete-rule').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentConfig.rules.splice(idx, 1);
        renderRules(currentConfig.rules);
        saveConfigSilently();
      });
    });
  }

  // Add rule
  addRuleBtn.addEventListener('click', () => {
    const url = document.getElementById('new-url').value || '.*';
    const ct = document.getElementById('new-ct').value || '.*';

    currentConfig.rules.push({
      id: Date.now(),
      enabled: true,
      url: url,
      ct: ct,
      rtype: 0
    });

    renderRules(currentConfig.rules);
    saveConfigSilently();

    document.getElementById('new-url').value = '';
    document.getElementById('new-ct').value = '';
  });

  function saveConfigSilently() {
    chrome.storage.local.set({ config: currentConfig });
  }

  function toggleSizeRangeVisibility() {
    sizeRangeConfig.style.display = noSmallFilesInput.checked ? 'block' : 'none';
  }

  noSmallFilesInput.addEventListener('change', toggleSizeRangeVisibility);

  // Save main settings automatically on change
  [enabledInput, autoDownloadInput, noSmallFilesInput, noZeroFilesInput, deduplicateInput, minSizeInput, maxSizeInput].forEach(el => {
    el.addEventListener('change', () => {
      currentConfig.enabled = enabledInput.checked;
      currentConfig.automaticdownload = autoDownloadInput.checked;
      currentConfig.nosmallfiles = noSmallFilesInput.checked;
      currentConfig.nozerofiles = noZeroFilesInput.checked;
      currentConfig.deduplicate = deduplicateInput.checked;
      currentConfig.minSize = parseInt(minSizeInput.value, 10) || 0;
      currentConfig.maxSize = parseInt(maxSizeInput.value, 10) || 0;
      saveConfigSilently();
    });
  });

  loadConfig();
});
