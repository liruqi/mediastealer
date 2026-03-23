/**
 * Fluxon Plugin Engine
 * Manages plugin registration and hook execution.
 */

const plugins = [];

/**
 * Registers a new plugin.
 * @param {Object} plugin - Plugin object with hooks: onIntercept, onPreDownload, onAction.
 *   Optional metadata fields: description {string}, defaultEnabled {boolean}
 */
function registerPlugin(plugin) {
  plugins.push(plugin);
  console.log(`Plugin registered: ${plugin.name || 'unnamed'}`);
}

/** Returns metadata for all registered plugins (safe to serialise). */
function getPlugins() {
  return plugins.map(p => ({
    name: p.name || 'unnamed',
    description: p.description || '',
    defaultEnabled: p.defaultEnabled !== false,
    options: p.options || []
  }));
}

/**
 * Executes a hook across all enabled registered plugins.
 * Plugin enabled state is read from `pluginsConfig` in chrome.storage.local.
 * @param {string} hookName - Name of the hook.
 * @param {any} arg - Argument passed to the hook.
 */
async function executeHook(hookName, arg) {
  // Load per-plugin enabled state
  let pluginsConfig = {};
  try {
    const stored = await new Promise(resolve => chrome.storage.local.get(['pluginsConfig'], resolve));
    pluginsConfig = stored.pluginsConfig || {};
  } catch (_) {}

  let result = {};
  for (const plugin of plugins) {
    // Skip disabled plugins
    const cfg = pluginsConfig[plugin.name];
    const isEnabled = cfg ? cfg.enabled !== false : (plugin.defaultEnabled !== false);
    if (!isEnabled) continue;

    // If a specific plugin is targeted, skip others
    if (arg && arg.pluginName && plugin.name !== arg.pluginName) continue;

    if (plugin[hookName] && typeof plugin[hookName] === 'function') {
      try {
        const hookArg = (typeof arg === 'object' && arg !== null) ? { ...arg, pluginConfig: cfg || {} } : arg;
        const hookResult = await plugin[hookName](hookArg);
        if (hookResult) {
          result = { ...result, ...hookResult };
        }
      } catch (e) {
        console.error(`Error in plugin hook ${hookName}:`, e);
      }
    }
  }
  return result;
}

// Export for service worker
if (typeof self !== 'undefined') {
  self.pluginEngine = {
    registerPlugin,
    getPlugins,
    executeHook
  };
}
