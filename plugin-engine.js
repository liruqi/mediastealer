/**
 * Fluxon Plugin Engine
 * Manages plugin registration and hook execution.
 */

const plugins = [];

/**
 * Registers a new plugin.
 * @param {Object} plugin - Plugin object with optional hooks: onIntercept, onPreCapture, onPreDownload, onPostDownload
 */
function registerPlugin(plugin) {
  plugins.push(plugin);
  console.log(`Plugin registered: ${plugin.name || 'unnamed'}`);
}

/**
 * Executes a hook across all registered plugins.
 * @param {string} hookName - Name of the hook.
 * @param {any} arg - Argument passed to the hook.
 * @returns {any} - The result of the hook (often an object to be merged or a control flag).
 */
async function executeHook(hookName, arg) {
  let result = {};
  for (const plugin of plugins) {
    // If a specific plugin is targeted, skip others
    if (arg && arg.pluginName && plugin.name !== arg.pluginName) continue;

    if (plugin[hookName] && typeof plugin[hookName] === 'function') {
      try {
        const hookResult = await plugin[hookName](arg);
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
    executeHook
  };
}
