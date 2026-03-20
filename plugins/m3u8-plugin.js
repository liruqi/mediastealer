/**
 * Fluxon M3U8 Plugin
 * Detects HLS playlists and manages merged downloads.
 */

const M3U8_PLUGIN = {
  name: "M3U8 Downloader",

  /**
   * Intercept hook: Detect .m3u8 and ignore size rules.
   */
  async onIntercept({ details, contentType, config }) {
    const url = details.url.toLowerCase();
    const isM3u8 = url.includes('.m3u8') || 
                   contentType.toLowerCase().includes('application/vnd.apple.mpegurl') ||
                   contentType.toLowerCase().includes('application/x-mpegurl');
    
    if (isM3u8) {
      return { 
        ignoreSize: true, 
        isPluginHandled: true,
        pluginName: this.name,
        type: 'm3u8'
      };
    }
    
    // Block individual fragments (TS, M4S, etc.)
    if (url.includes('.ts') || url.includes('.m4s') || url.includes('.m4v') || url.includes('.m4a')) {
       // Returning skip:true prevents background.js from capturing these at all
       return { skip: true };
    }

    return null;
  },

  /**
   * Pre-download hook: Handle the merging process.
   */
  async onPreDownload({ item, config }) {
    if (item.type !== 'm3u8') return null;
    
    // Only auto-trigger if automatic download is enabled
    if (config.automaticdownload) {
      this.triggerMerge(item);
      return { handled: true };
    }
    return null;
  },

  /**
   * Action hook: Handle manual triggers from the UI.
   */
  async onAction({ action, itemId, config }) {
    if (action === 'merge') {
      chrome.storage.local.get(['capturedMedia'], (result) => {
        const media = result.capturedMedia || [];
        const item = media.find(m => m.id === itemId);
        if (item) {
          this.triggerMerge(item);
        }
      });
    }
  },

  async triggerMerge(item) {
    console.log(`M3U8 Plugin: Starting merge for ${item.url}`);
    
    // Use the global updateItemStatus from background.js
    if (typeof updateItemStatus === 'function') {
      updateItemStatus(item.id, 'Downloading');
    }

    try {
      // 1. Fetch the playlist
      const resp = await fetch(item.url);
      const m3u8Content = await resp.text();
      
      // 2. Parse segment URLs and EXT-X-MAP
      const lines = m3u8Content.split('\n');
      const segmentUrls = [];
      let mapUrl = null;
      const baseUrl = item.url.substring(0, item.url.lastIndexOf('/') + 1);

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('#EXT-X-MAP')) {
          const match = line.match(/URI="([^"]+)"/);
          if (match) {
            mapUrl = new URL(match[1], baseUrl).href;
          }
        } else if (!line.startsWith('#')) {
          try {
            const url = new URL(line, baseUrl).href;
            segmentUrls.push(url);
          } catch (e) {
            console.error('Failed to resolve segment URL:', line, e);
          }
        }
      }

      if (segmentUrls.length === 0) throw new Error('No segments found in playlist');

      // 3. Request offscreen merge
      await this.ensureOffscreen();
      
      let folderName = item.filename.replace('.m3u8', '') + '.m3u8';
      const finalFilename = `${folderName}/merged_video.ts`;
      
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'MERGE_M3U8',
        data: {
          playlistUrl: item.url,
          segmentUrls: segmentUrls,
          mapUrl: mapUrl,
          filename: finalFilename,
          folderName: folderName
        }
      });

    } catch (e) {
      console.error('M3U8 Plugin triggerMerge error:', e);
    }
  },

  async ensureOffscreen() {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Merging video segments into a single file.'
    });
  }
};

// Register the plugin
if (typeof self !== 'undefined' && self.pluginEngine) {
  self.pluginEngine.registerPlugin(M3U8_PLUGIN);
}
