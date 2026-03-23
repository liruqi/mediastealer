document.addEventListener('DOMContentLoaded', () => {
  const enabledInput = document.getElementById('enabled');
  const autoDownloadInput = document.getElementById('automaticdownload');
  const noSmallFilesInput = document.getElementById('nosmallfiles');
  const noZeroFilesInput = document.getElementById('nozerofiles');
  const deduplicateInput = document.getElementById('deduplicate');
  const autoCleanInput = document.getElementById('autoClean');
  const minSizeInput = document.getElementById('minSize');
  const maxSizeInput = document.getElementById('maxSize');
  const sizeRangeConfig = document.getElementById('size-range-config');
  const rulesTableBody = document.querySelector('#rules-table tbody');
  const addRuleBtn = document.getElementById('add-rule-btn');
  const extensionsTableBody = document.querySelector('#extensions-table tbody');
  const addExtensionBtn = document.getElementById('add-extension-btn');
  const newExtensionInput = document.getElementById('new-extension');
  const downloadToFolderInput = document.getElementById('downloadToFolder');
  const downloadToFolderRow = document.getElementById('downloadToFolderRow');
  const downloadToFolderDesc = document.getElementById('downloadToFolderDesc');

  const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isMobileOS = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isPcChromeOrFirefox = !isSafariBrowser && !isMobileOS;

  if (!isPcChromeOrFirefox) {
    if (downloadToFolderRow) downloadToFolderRow.style.display = 'none';
    if (downloadToFolderDesc) downloadToFolderDesc.style.display = 'none';
  }

  let currentConfig = {};

  const defaultRules = [
    { id: 1, enabled: true, url: ".*", ct: "video/.*", tag: "video", rtype: 1 },
    { id: 2, enabled: true, url: ".*", ct: "audio/.*", tag: "audio", rtype: 2 },
    { id: 3, enabled: true, url: ".*", ct: "application/x-shockwave-flash", tag: "video", rtype: 3 },
    { id: 4, enabled: true, url: ".*", ct: "image/.*", tag: "image", rtype: 4 }
  ];

  // Load configuration from storage
  function loadConfig() {
    chrome.storage.local.get(['config'], (result) => {
      const defaults = {
        enabled: true,
        rules: defaultRules,
        automaticdownload: false,
        nosmallfiles: true,
        nozerofiles: true,
        deduplicate: true,
        autoClean: true,
        minSize: 800,
        maxSize: 0,
        ignoredExtensions: [".gif", ".svg", ".ico"],
        downloadToFolder: true
      };
      currentConfig = result.config ? { ...defaults, ...result.config } : defaults;

      enabledInput.checked = currentConfig.enabled;
      autoDownloadInput.checked = currentConfig.automaticdownload;
      noSmallFilesInput.checked = currentConfig.nosmallfiles;
      noZeroFilesInput.checked = currentConfig.nozerofiles;
      deduplicateInput.checked = currentConfig.deduplicate;
      autoCleanInput.checked = currentConfig.autoClean !== false;
      minSizeInput.value = currentConfig.minSize || 800;
      maxSizeInput.value = currentConfig.maxSize || 0;
      downloadToFolderInput.checked = currentConfig.downloadToFolder !== false;

      toggleSizeRangeVisibility();
      renderRules(currentConfig.rules);
      renderExtensions(currentConfig.ignoredExtensions || []);
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
          <select class="rule-tag" data-index="${index}" style="width: 100%; box-sizing: border-box;">
            <option value="" ${rule.tag === '' || !rule.tag ? 'selected' : ''}>${chrome.i18n.getMessage('opt_tag_empty') || '(Empty)'}</option>
            <option value="video" ${rule.tag === 'video' ? 'selected' : ''}>${chrome.i18n.getMessage('opt_tag_video') || 'Video'}</option>
            <option value="audio" ${rule.tag === 'audio' ? 'selected' : ''}>${chrome.i18n.getMessage('opt_tag_audio') || 'Audio'}</option>
            <option value="image" ${rule.tag === 'image' ? 'selected' : ''}>${chrome.i18n.getMessage('opt_tag_image') || 'Image'}</option>
          </select>
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

    document.querySelectorAll('.rule-tag').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentConfig.rules[idx].tag = e.target.value;
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

  // Render extensions table
  function renderExtensions(extensions) {
    extensionsTableBody.innerHTML = '';
    extensions.forEach((ext, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <input type="text" value="${ext}" style="width: 100%; box-sizing: border-box;" class="ext-value" data-index="${index}">
        </td>
        <td>
          <button class="delete-ext danger" data-index="${index}" data-i18n="btn_delete">${chrome.i18n.getMessage('btn_delete')}</button>
        </td>
      `;
      extensionsTableBody.appendChild(tr);
    });

    document.querySelectorAll('.ext-value').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentConfig.ignoredExtensions[idx] = e.target.value.trim().toLowerCase();
        saveConfigSilently();
      });
    });

    document.querySelectorAll('.delete-ext').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentConfig.ignoredExtensions.splice(idx, 1);
        renderExtensions(currentConfig.ignoredExtensions);
        saveConfigSilently();
      });
    });
  }

  // Add rule
  addRuleBtn.addEventListener('click', () => {
    const url = document.getElementById('new-url').value || '.*';
    const ct = document.getElementById('new-ct').value || '.*';
    const tag = document.getElementById('new-tag').value || '';

    currentConfig.rules.push({
      id: Date.now(),
      enabled: true,
      url: url,
      ct: ct,
      tag: tag,
      rtype: 0
    });

    renderRules(currentConfig.rules);
    saveConfigSilently();

    document.getElementById('new-url').value = '';
    document.getElementById('new-ct').value = '';
    document.getElementById('new-tag').value = '';
  });

  // Add extension
  addExtensionBtn.addEventListener('click', () => {
    const val = newExtensionInput.value.trim().toLowerCase();
    if (val) {
      if (!currentConfig.ignoredExtensions) currentConfig.ignoredExtensions = [];
      const parts = val.split(',').map(p => p.trim()).filter(p => p.length > 0);
      parts.forEach(p => {
        if (!currentConfig.ignoredExtensions.includes(p)) {
          currentConfig.ignoredExtensions.push(p);
        }
      });
      renderExtensions(currentConfig.ignoredExtensions);
      saveConfigSilently();
      newExtensionInput.value = '';
    }
  });

  function saveConfigSilently() {
    chrome.storage.local.set({ config: currentConfig });
  }

  function toggleSizeRangeVisibility() {
    sizeRangeConfig.style.display = noSmallFilesInput.checked ? 'block' : 'none';
  }

  noSmallFilesInput.addEventListener('change', toggleSizeRangeVisibility);

  // Save main settings automatically on change
  [enabledInput, autoDownloadInput, noSmallFilesInput, noZeroFilesInput, deduplicateInput, autoCleanInput, minSizeInput, maxSizeInput, downloadToFolderInput].forEach(el => {
    el.addEventListener('change', () => {
      currentConfig.enabled = enabledInput.checked;
      currentConfig.automaticdownload = autoDownloadInput.checked;
      currentConfig.nosmallfiles = noSmallFilesInput.checked;
      currentConfig.nozerofiles = noZeroFilesInput.checked;
      currentConfig.deduplicate = deduplicateInput.checked;
      currentConfig.autoClean = autoCleanInput.checked;
      currentConfig.minSize = parseInt(minSizeInput.value, 10) || 0;
      currentConfig.maxSize = parseInt(maxSizeInput.value, 10) || 0;
      currentConfig.downloadToFolder = downloadToFolderInput.checked;
      saveConfigSilently();
      if (el === noSmallFilesInput) toggleSizeRangeVisibility();
    });
  });

  // ── Plugin Settings ────────────────────────────────────────
  const pluginsList = document.getElementById('plugins-list');

  function renderPluginOptionsHtml(plugin, cfg) {
    if (!plugin.options || plugin.options.length === 0) return '';
    const pluginOpts = (cfg && cfg.options) ? cfg.options : {};
    let html = '<div class="plugin-options" style="margin-top: 10px; margin-left: 0;">';
    for (const opt of plugin.options) {
      const val = pluginOpts[opt.id] !== undefined ? pluginOpts[opt.id] : opt.defaultValue;
      if (opt.type === 'checkbox') {
        html += `
          <div class="setting-row" style="margin-bottom: 5px;">
            <input type="checkbox" id="plugin-opt-${plugin.name.replace(/\s+/g, '-')}-${opt.id}" data-opt="${opt.id}" ${val ? 'checked' : ''}>
            <label for="plugin-opt-${plugin.name.replace(/\s+/g, '-')}-${opt.id}" style="font-size: 13px;">${opt.label}</label>
          </div>
        `;
      }
    }
    html += '</div>';
    return html;
  }

  function bindPluginOptionsEvents(row, plugin) {
    if (!plugin.options || plugin.options.length === 0) return;
    row.querySelectorAll('input[type="checkbox"][data-opt]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        chrome.storage.local.get(['pluginsConfig'], (res) => {
          const updated = res.pluginsConfig || {};
          if (!updated[plugin.name]) {
            updated[plugin.name] = { enabled: plugin.defaultEnabled !== false, options: {} };
          }
          if (!updated[plugin.name].options) updated[plugin.name].options = {};
          updated[plugin.name].options[e.target.dataset.opt] = e.target.checked;
          chrome.storage.local.set({ pluginsConfig: updated });
        });
      });
    });
  }

  function renderPlugins(pluginsMeta, pluginsConfig) {
    pluginsList.innerHTML = '';
    if (!pluginsMeta || pluginsMeta.length === 0) {
      pluginsList.innerHTML = '<p class="setting-desc" style="margin:0">No plugins registered.</p>';
      return;
    }
    pluginsMeta.forEach(plugin => {
      const cfg = pluginsConfig[plugin.name];
      const isEnabled = cfg ? cfg.enabled !== false : plugin.defaultEnabled;
      const id = `plugin-toggle-${plugin.name.replace(/\s+/g, '-')}`;

      const row = document.createElement('div');
      row.className = 'toggle-row';
      row.innerHTML = `
        <label class="toggle-switch" title="${isEnabled ? 'Enabled' : 'Disabled'}">
          <input type="checkbox" id="${id}" ${isEnabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <div class="plugin-info">
          <div class="plugin-name">${plugin.name}</div>
          ${plugin.description ? `<div class="plugin-desc">${plugin.description}</div>` : ''}
          ${renderPluginOptionsHtml(plugin, cfg)}
        </div>
      `;
      pluginsList.appendChild(row);

      bindPluginOptionsEvents(row, plugin);

      row.querySelector(`input#${id}`).addEventListener('change', (e) => {
        chrome.storage.local.get(['pluginsConfig'], (res) => {
          const updated = res.pluginsConfig || {};
          const existing = updated[plugin.name] || {};
          updated[plugin.name] = { ...existing, enabled: e.target.checked };
          chrome.storage.local.set({ pluginsConfig: updated });
        });
      });
    });
  }

  function loadPlugins() {
    chrome.runtime.sendMessage({ type: 'GET_PLUGINS' }, (response) => {
      const pluginsMeta = response?.plugins || [];
      chrome.storage.local.get(['pluginsConfig'], (res) => {
        renderPlugins(pluginsMeta, res.pluginsConfig || {});
      });
    });
  }

  loadConfig();
  loadPlugins();
});
