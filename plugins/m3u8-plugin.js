/**
 * Fluxon M3U8 Plugin
 * Detects HLS playlists and manages merged downloads.
 */

const M3U8_PLUGIN = {
  name: "M3U8 Downloader",
  handledUrls: new Set(),

  /**
   * Intercept hook: Detect .m3u8 and ignore size rules.
   */
  async onIntercept({ details, contentType, config }) {
    const url = details.url.toLowerCase();
    const isM3u8 = url.includes('.m3u8') ||
      contentType.toLowerCase().includes('application/vnd.apple.mpegurl') ||
      contentType.toLowerCase().includes('application/x-mpegurl');

    if (isM3u8) {
      let streamType = 'hls';
      if (url.includes('master')) streamType = 'master';
      else if (url.includes('/vid/') || url.includes('avc1')) streamType = 'video';
      else if (url.includes('/aud/') || url.includes('mp4a')) streamType = 'audio';

      return {
        ignoreSize: true,
        isPluginHandled: true,
        pluginName: this.name,
        type: 'm3u8',
        streamType: streamType
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
    if (this.handledUrls.has(item.url)) return { handled: true };

    // Only auto-trigger if automatic download is enabled
    if (config.automaticdownload) {
      // Delay slightly to allow Master playlist to be captured/prioritized
      setTimeout(() => {
        if (!this.handledUrls.has(item.url)) {
          this.triggerMerge(item);
        }
      }, 500);
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

  async triggerMerge(item, depth = 0, parentFolder = null) {
    if (depth > 3) {
      console.error('M3U8 Plugin: Max playlist depth reached');
      return;
    }

    console.log(`M3U8 Plugin: Processing playlist ${item.url} (depth: ${depth})`);

    if (depth === 0 && typeof updateItemStatus === 'function') {
      updateItemStatus(item.id, 'Downloading');
    }

    this.handledUrls.add(item.url);

    try {
      const resp = await fetch(item.url);
      const m3u8Content = await resp.text();
      const baseUrl = item.url.substring(0, item.url.lastIndexOf('/') + 1);
      const lines = m3u8Content.split(/\r?\n/);
      
      // Determine Folder Name for this stage
      const urlBase = item.url.split('/').pop().split('?')[0].replace(/\.m3u8$/i, '').replace(/\./g, '_');
      let folderName;
      if (parentFolder) {
        folderName = `${parentFolder}/${urlBase}_hls`;
      } else {
        const datePart = item.dateFolder || 'FLX-Unknown';
        const domainPart = item.domain || 'unknown';
        folderName = `${datePart}/${domainPart}/${urlBase}_hls`;
      }
      
      // 1. Detect Master Playlist
      const variants = [];
      let isMaster = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          isMaster = true;
          const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
          const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
          const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
          if (nextLine && !nextLine.startsWith('#')) {
            const vUrl = new URL(nextLine, baseUrl).href;
            this.handledUrls.add(vUrl);
            variants.push({
              url: vUrl,
              bandwidth: bandwidth,
              resolution: resMatch ? resMatch[1] : 'unknown',
              info: line
            });
          }
        }
      }

      if (isMaster && variants.length > 0) {
        // Pick best variant (highest bandwidth)
        variants.sort((a, b) => b.bandwidth - a.bandwidth);
        const bestVariant = variants[0];
        
        chrome.runtime.sendMessage({ 
          type: 'MERGE_PROGRESS', 
          data: { filename: item.filename, status: `Master Playlist: Selecting best variant: ${bestVariant.resolution} (${bestVariant.bandwidth} bps)` } 
        });

        // Search for associated audio track
        console.log('M3U8 Plugin: Checking for audio groups in variant:', bestVariant.info);
        const audioGroupIdMatch = bestVariant.info.match(/AUDIO="([^"]+)"/);
        if (audioGroupIdMatch) {
          const groupId = audioGroupIdMatch[1];
          chrome.runtime.sendMessage({ 
            type: 'MERGE_PROGRESS', 
            data: { filename: item.filename, status: `Found Audio Group: ${groupId}. Searching for track...` } 
          });
          const audioMediaLine = lines.find(l => l.includes('#EXT-X-MEDIA') && l.includes('TYPE=AUDIO') && l.includes(`GROUP-ID="${groupId}"`));
          if (audioMediaLine) {
            const audioUriMatch = audioMediaLine.match(/URI="([^"]+)"/);
            if (audioUriMatch) {
              const audioUrl = new URL(audioUriMatch[1], baseUrl).href;
              chrome.runtime.sendMessage({ 
                type: 'MERGE_PROGRESS', 
                data: { filename: item.filename, status: `Auto-merging associated Audio track: ${audioUrl}` } 
              });
              // Trigger audio merge in parallel (nested)
              this.triggerMerge({ ...item, url: audioUrl }, depth + 1, folderName);
            } else {
              chrome.runtime.sendMessage({ 
                type: 'MERGE_PROGRESS', 
                data: { filename: item.filename, status: `[NOTE] Audio group ${groupId} has no URI (often embedded in video TS)` } 
              });
            }
          }
        }
        
        // Finalize Video merge (nested)
        return this.triggerMerge({ ...item, url: bestVariant.url }, depth + 1, folderName);
      }

      // Identify if this is likely an audio track
      const isAudio = item.url.includes('/aud/') || item.url.includes('mp4a') || 
                      (!m3u8Content.includes('RESOLUTION=') && !m3u8Content.includes('avc1'));
      const streamLabel = isAudio ? 'Audio' : 'Video';
      
      if (depth === 0) {
        chrome.runtime.sendMessage({ 
          type: 'MERGE_PROGRESS', 
          data: { filename: item.filename, status: `[PRO TIP] This is a standalone ${streamLabel} track. For full video + sound, click Merge on a [MASTER] item if available.` } 
        });
      }
      
      chrome.runtime.sendMessage({ 
        type: 'MERGE_PROGRESS', 
        data: { filename: item.filename, status: `Merging ${streamLabel} HLS stream...` } 
      });

      // 2. Parse segments/keys (Media Playlist logic)
      const segments = [];
      let mapUrl = null;
      let currentKey = null;
      let sequenceStart = 0;

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
          const match = line.match(/:(\d+)/);
          if (match) sequenceStart = parseInt(match[1], 10);
        } else if (line.startsWith('#EXT-X-MAP')) {
          const match = line.match(/URI="([^"]+)"/);
          if (match) {
            mapUrl = new URL(match[1], baseUrl).href;
          }
        } else if (line.startsWith('#EXT-X-KEY')) {
          const match = line.match(/METHOD=([^,]+),URI="([^"]+)"(?:,IV=([^,]+))?/);
          if (match) {
            const method = match[1];
            if (method === 'AES-128') {
              currentKey = {
                url: new URL(match[2], baseUrl).href,
                iv: match[3] || null
              };
            } else {
              currentKey = null; // Unsupported method
            }
          }
        } else if (!line.startsWith('#')) {
          try {
            const url = new URL(line, baseUrl).href;
            segments.push({
              url: url,
              key: currentKey ? { ...currentKey } : null
            });
          } catch (e) {
            console.error('Failed to resolve segment URL:', line, e);
          }
        }
      }

      if (segments.length === 0) throw new Error('No segments found in playlist');

      await this.ensureOffscreen();

      const isFMP4 = !!mapUrl || segments.some(s => s.url.includes('.m4s'));
      const ext = isFMP4 ? (isAudio ? 'm4a' : 'mp4') : 'ts';
      const finalFilename = `${folderName}/merged_${isAudio ? 'audio' : 'video'}.${ext}`;

      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'MERGE_M3U8',
        data: {
          playlistUrl: item.url,
          m3u8Content: m3u8Content,
          segments: segments,
          sequenceStart: sequenceStart,
          mapUrl: mapUrl,
          filename: finalFilename,
          folderName: folderName
        }
      }, (response) => {
        if (response && response.success && response.downloadId) {
          if (typeof updateItemStatus === 'function') {
            updateItemStatus(item.id, 'Downloading', response.downloadId);
          }
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
