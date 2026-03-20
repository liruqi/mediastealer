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
    const isM3u8 = details.url.toLowerCase().includes('.m3u8') || 
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
    
    // Check if this is a fragment of an already handled M3U8 (to skip it)
    // This is a bit tricky, but we can check if the URL matches common fragment patterns
    if (details.url.toLowerCase().includes('.ts') || details.url.toLowerCase().includes('.m4s')) {
       // We'll let background.js check if it's already "known" via capturedUrls
    }

    return null;
  },

  /**
   * Pre-download hook: Handle the merging process.
   */
  async onPreDownload({ item, config }) {
    if (item.type !== 'm3u8') return null;

    console.log(`M3U8 Plugin: Starting download for ${item.url}`);
    
    try {
      // 1. Fetch the playlist
      const resp = await fetch(item.url);
      const m3u8Content = await resp.text();
      
      // 2. Parse segment URLs (simple regex for now)
      const lines = m3u8Content.split('\n');
      const segmentUrls = [];
      const baseUrl = item.url.substring(0, item.url.lastIndexOf('/') + 1);

      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          // Resolve relative URLs
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
      
      const filename = item.filename.replace('.m3u8', '.ts'); // Convert to .ts for merged file
      
      const result = await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'MERGE_M3U8',
        data: {
          playlistUrl: item.url,
          segmentUrls: segmentUrls,
          filename: filename
        }
      });

      if (result && result.success) {
        return { handled: true, downloadId: result.downloadId };
      } else {
        throw new Error(result ? result.error : 'Unknown offscreen error');
      }

    } catch (e) {
      console.error('M3U8 Plugin error:', e);
      return { error: e.message };
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
