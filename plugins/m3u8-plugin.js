/**
 * Fluxon M3U8 Plugin
 * Detects HLS playlists and manages merged downloads with in-browser MP4 muxing.
 */

const M3U8_PLUGIN = {
  name: "M3U8 Downloader",
  description: "Detects HLS (.m3u8) streams and merges video/audio segments into a single MP4 file.",
  defaultEnabled: true,
  options: [
    {
      id: "displayNonHls",
      label: "Display specific variant playlists (master, audio, video m3u8) in capture list",
      type: "checkbox",
      defaultValue: false
    }
  ],
  handledUrls: new Set(),

  /**
   * Intercept hook: Detect .m3u8 and ignore size rules.
   */
  async onIntercept({ details, contentType, config, pluginConfig }) {
    const ct = (contentType || '').toLowerCase();
    
    // Skip obvious non-playlist types to avoid false positives (e.g. tracking logs with .m3u8 in params)
    if (ct.includes('image/') || ct.includes('text/html') || ct.includes('application/json')) {
      return null;
    }

    const url = details.url.toLowerCase();
    let urlObj;
    try {
      urlObj = new URL(details.url);
    } catch (e) {
      return null;
    }

    const path = urlObj.pathname.toLowerCase();

    // 1. Detect M3U8 Playlist (Path-based or Content-Type based)
    let isM3u8 = path.endsWith('.m3u8') ||
                 ct.includes('application/vnd.apple.mpegurl') ||
                 ct.includes('application/x-mpegurl');

    if (isM3u8) {
      let streamType = 'hls';
      if (url.includes('master')) streamType = 'master';
      else if (url.includes('/vid/') || url.includes('avc1')) streamType = 'video';
      else if (url.includes('/aud/') || url.includes('mp4a')) streamType = 'audio';

      if (streamType !== 'hls' && !(pluginConfig?.options?.displayNonHls)) {
        return { skip: true };
      }

      return {
        ignoreSize: true,
        isPluginHandled: true,
        pluginName: this.name,
        type: 'm3u8',
        streamType: streamType
      };
    }

    // 2. Block individual fragments (TS, M4S, AAC, fMP4, etc.)
    const fragmentExts = ['.ts', '.m4s', '.m4v', '.m4a', '.f4s', '.m4f', '.aac'];
    if (fragmentExts.some(ext => path.endsWith(ext))) {
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

    if (config.automaticdownload) {
      setTimeout(() => {
        if (!this.handledUrls.has(item.url)) {
          this.triggerMerge(item, 0, { config });
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
          this.triggerMerge(item, 0, { config });
        }
      });
    }
  },

  async triggerMerge(item, depth = 0, options = {}) {
    if (depth > 3) {
      console.error('M3U8 Plugin: Max playlist depth reached');
      return { success: false, error: 'Depth exceeded' };
    }

    console.log(`M3U8 Plugin: Processing playlist ${item.url} (depth: ${depth})`);
    this.handledUrls.add(item.url);

    try {
      const resp = await fetch(item.url);
      const m3u8Content = await resp.text();
      const baseUrl = item.url.substring(0, item.url.lastIndexOf('/') + 1);
      const lines = m3u8Content.split(/\r?\n/);

      const urlBase = item.url.split('/').pop().split('?')[0].replace(/\.m3u8$/i, '').replace(/\./g, '_');
      const datePart = item.dateFolder || 'FLX-Unknown';
      const domainPart = item.domain || 'unknown';
      const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isMobileOS = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const configObj = options.config || {};
      const downloadToFolder = configObj.downloadToFolder !== false && !isSafariBrowser && !isMobileOS;
      
      const basePath = downloadToFolder 
        ? `${datePart}/${domainPart}/${urlBase}`
        : `${datePart}_${domainPart}_${urlBase}`;

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
        variants.sort((a, b) => b.bandwidth - a.bandwidth);
        const bestVariant = variants[0];

        // Search for associated audio track across variants
        let bestAudioUrl = null;
        const audioGroupIdMatch = bestVariant.info.match(/AUDIO="([^"]+)"/);
        if (audioGroupIdMatch) {
          const groupId = audioGroupIdMatch[1];
          const audioMediaLine = lines.find(l => l.includes('#EXT-X-MEDIA') && l.includes('TYPE=AUDIO') && l.includes(`GROUP-ID="${groupId}"`));
          if (audioMediaLine) {
            const audioUriMatch = audioMediaLine.match(/URI="([^"]+)"/);
            if (audioUriMatch) {
              bestAudioUrl = new URL(audioUriMatch[1], baseUrl).href;
            }
          }
        }

        const muxId = `mux_${Date.now()}`;
        const videoMergePromise = this.triggerMerge(
          { ...item, url: bestVariant.url, type: 'video' },
          depth + 1,
          { config: options.config, shouldSaveToDB: true, muxKey: `${muxId}_v` }
        );

        let audioMergePromise = Promise.resolve({ success: true, muxKey: null });
        console.log(`M3U8 Plugin: Coordinating Master Merge. Video: ${bestVariant.url}, Audio: ${bestAudioUrl || 'none'}`);
        dispatchToBackground({
          type: 'MERGE_PROGRESS',
          data: { filename: item.url, status: `[MASTER] Coordinating Video & Audio tracks...` }
        });

        if (bestAudioUrl) {
          audioMergePromise = this.triggerMerge(
            { ...item, url: bestAudioUrl, type: 'audio' },
            depth + 1,
            { config: options.config, shouldSaveToDB: true, muxKey: `${muxId}_a` }
          );
        }

        const [vRes, aRes] = await Promise.all([videoMergePromise, audioMergePromise]);

        if (vRes?.success && vRes.muxKey) {
          console.log(`M3U8 Plugin: Video track ready for MUX.`);
          dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename: item.url, status: `[MASTER] Video track ready.` } });
        }
        if (bestAudioUrl && aRes?.success && aRes.muxKey) {
          console.log(`M3U8 Plugin: Audio track ready for MUX.`);
          dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename: item.url, status: `[MASTER] Audio track ready.` } });
        }

        if (vRes?.success && vRes.muxKey && (!bestAudioUrl || (aRes?.success && aRes.muxKey))) {
          const finalFilename = `${basePath}_hls.mp4`;
          console.log(`M3U8 Plugin: Coordination complete, triggering MUX: ${finalFilename}`);

          await this.ensureOffscreen();
          const muxMsg = {
            type: 'MUX_MEDIA',
            data: {
              videoKey: vRes.muxKey,
              audioKey: aRes?.muxKey,
              filename: finalFilename,
              itemId: item.id
            }
          };
          dispatchToOffscreen(muxMsg);
        } else {
          const vErr = vRes?.error ? `Video: ${vRes.error}` : '';
          const aErr = aRes?.error ? `Audio: ${aRes.error}` : '';
          console.error(`M3U8 Plugin: Coordination failed. ${vErr} ${aErr}`);
          dispatchToBackground({
            type: 'MERGE_PROGRESS',
            data: { filename: item.url, status: `[ERROR] Coordination failed. ${vErr} ${aErr}` }
          });
        }
        return { success: true };
      }

      const isAudio = item.url.includes('/aud/') || item.url.includes('mp4a') ||
        (!m3u8Content.includes('RESOLUTION=') && !m3u8Content.includes('avc1'));

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
          if (match) mapUrl = new URL(match[1], baseUrl).href;
        } else if (line.startsWith('#EXT-X-KEY')) {
          const match = line.match(/METHOD=([^,]+),URI="([^"]+)"(?:,IV=([^,]+))?/);
          if (match) {
            if (match[1] === 'AES-128') {
              currentKey = { url: new URL(match[2], baseUrl).href, iv: match[3] || null };
            } else currentKey = null;
          }
        } else if (!line.startsWith('#')) {
          try {
            segments.push({ url: new URL(line, baseUrl).href, key: currentKey ? { ...currentKey } : null });
          } catch (e) { }
        }
      }

      if (segments.length === 0) throw new Error('No segments found');

      await this.ensureOffscreen();

      const isFMP4 = !!mapUrl || segments.some(s => s.url.includes('.m4s'));
      const ext = isFMP4 ? (isAudio ? 'm4a' : 'mp4') : 'ts';
      const finalFilename = `${basePath}_${isAudio ? 'audio' : 'video'}.${ext}`;

      return new Promise((resolve) => {
        const msg = {
          target: 'offscreen',
          type: 'MERGE_M3U8',
          data: {
            playlistUrl: item.url,
            m3u8Content: m3u8Content,
            segments: segments,
            sequenceStart: sequenceStart,
            mapUrl: mapUrl,
            filename: finalFilename,
            ...options
          }
        };

        const callback = (response) => {
          if (response && response.success) {
            resolve({ success: true, muxKey: response.muxKey });
          } else {
            resolve({ success: false, error: response?.error });
          }
        };

        dispatchToOffscreen(msg, callback);
      });

    } catch (e) {
      console.error('M3U8 Plugin triggerMerge error:', e);
      return { success: false, error: e.message };
    }
  },

  async ensureOffscreen() {
    // If successfully running in a context where offscreen logic is directly available (Firefox background)
    if (typeof self.handleOffscreenMessage === 'function') {
      return;
    }

    if (chrome.offscreen) {
      if (this._offscreenPromise) return this._offscreenPromise;
      this._offscreenPromise = (async () => {
        try {
          if (await chrome.offscreen.hasDocument()) return;
          await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['BLOBS'],
            justification: 'Merging video segments into a single file.'
          });
        } catch (e) {
          console.error('Failed to create offscreen document:', e);
          this._offscreenPromise = null;
          throw e;
        }
      })();
      return this._offscreenPromise;
    }

    // Fallback for Safari / other browsers without offscreen API
    if (this._fallbackTabPromise) return this._fallbackTabPromise;
    this._fallbackTabPromise = new Promise((resolve, reject) => {
      chrome.tabs.create({ url: chrome.runtime.getURL('offscreen.html'), active: false }, (tab) => {
        if (chrome.runtime.lastError) {
          this._fallbackTabPromise = null;
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    return this._fallbackTabPromise;
  }
};

// plugins/m3u8-plugin.js
// Intercepts m3u8 and ts requests, generates download links for master list

function dispatchToBackground(msg, cb) {
  if (!chrome.offscreen && typeof self.handleBackgroundMessage === 'function') {
    self.handleBackgroundMessage(msg, {}, cb || (() => { }));
  } else {
    if (cb) chrome.runtime.sendMessage(msg, cb);
    else chrome.runtime.sendMessage(msg).catch(() => { });
  }
}

function dispatchToOffscreen(msg, cb) {
  if (!chrome.offscreen && typeof self.handleOffscreenMessage === 'function') {
    self.handleOffscreenMessage(msg, {}, cb || (() => { }));
  } else {
    if (cb) chrome.runtime.sendMessage(msg, cb);
    else chrome.runtime.sendMessage(msg).catch(() => { });
  }
}

// Register the plugin
if (typeof self !== 'undefined' && self.pluginEngine) {
  self.pluginEngine.registerPlugin(M3U8_PLUGIN);
}
