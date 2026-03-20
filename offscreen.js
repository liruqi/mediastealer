/**
 * Fluxon Offscreen Script
 * Handles fetching segments and merging them into a single Blob.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MERGE_M3U8') {
    const { playlistUrl, segments, sequenceStart, mapUrl, filename, folderName } = message.data;
    console.log(`Offscreen: Starting Pro merge for ${filename} (${segments.length} segments)`);

    (async () => {
      try {
        const keyCache = new Map(); // url -> CryptoKey
        const segmentBuffers = new Array(segments.length + (mapUrl ? 1 : 0));
        const CONCURRENCY = 5;
        let completed = 0;

        // Helper: Fetch with retry
        async function fetchWithRetry(url, retries = 3) {
          for (let i = 0; i < retries; i++) {
            try {
              const resp = await fetch(url);
              if (resp.ok) return await resp.arrayBuffer();
            } catch (e) {
              if (i === retries - 1) throw e;
            }
            await new Promise(r => setTimeout(r, 1000));
          }
          throw new Error(`Failed to fetch ${url} after ${retries} retries`);
        }

        // Helper: Get or import Key
        async function getCryptoKey(keyInfo) {
          if (!keyInfo || !keyInfo.url) return null;
          if (keyCache.has(keyInfo.url)) return keyCache.get(keyInfo.url);

          const keyBuf = await fetchWithRetry(keyInfo.url);
          const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuf,
            { name: 'AES-CBC' },
            false,
            ['decrypt']
          );
          keyCache.set(keyInfo.url, cryptoKey);
          return cryptoKey;
        }

        // Helper: Decrypt segment
        async function decryptSegment(buffer, keyInfo, segmentIndex) {
          if (!keyInfo) return buffer;
          const cryptoKey = await getCryptoKey(keyInfo);
          
          let iv;
          if (keyInfo.iv) {
            const hex = keyInfo.iv.startsWith('0x') ? keyInfo.iv.substring(2) : keyInfo.iv;
            iv = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
          } else {
            // Default IV is the 16-byte representation of the sequence number
            const sequenceNumber = (sequenceStart || 0) + segmentIndex;
            iv = new Uint8Array(16);
            for (let i = 15; i >= 12; i--) {
               iv[i] = (sequenceNumber >> (8 * (15 - i))) & 0xff;
            }
          }

          try {
            return await crypto.subtle.decrypt(
              { name: 'AES-CBC', iv: iv },
              cryptoKey,
              buffer
            );
          } catch (e) {
            console.error(`Decryption failed for segment ${segmentIndex}:`, e);
            throw e;
          }
        }

        // 1. Process Map (Initialization)
        if (mapUrl) {
          const mapBuf = await fetchWithRetry(mapUrl);
          segmentBuffers[0] = mapBuf;
        }

        // 2. Process Segments with Concurrency
        const downloadQueue = [];
        const queue = [...segments.entries()];
        const workers = Array(CONCURRENCY).fill(null).map(async () => {
          while (queue.length > 0) {
            const [index, seg] = queue.shift();
            try {
              const buffer = await fetchWithRetry(seg.url);
              const decrypted = await decryptSegment(buffer, seg.key, index);
              segmentBuffers[mapUrl ? index + 1 : index] = decrypted;
              
              // Add to download queue for individual fragments (sequentially handled later)
              if (folderName) {
                const ext = seg.url.split('?')[0].split('.').pop() || 'ts';
                downloadQueue.push({
                  sourceUrl: seg.url,
                  data: decrypted,
                  filename: `${folderName}/fragment_${String(index + 1).padStart(3, '0')}.${ext}`
                });
              }

              completed++;
              chrome.runtime.sendMessage({
                type: 'MERGE_PROGRESS',
                data: { filename, current: completed, total: segments.length, status: `Fetched ${completed}/${segments.length}: ${seg.url}` }
              });
            } catch (e) {
              console.error(`Worker failed on segment ${index}:`, e);
              throw e;
            }
          }
        });

        // Helper: Download via Background
        async function downloadViaBackground(url, filename) {
          return new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'DOWNLOAD_INTERNAL',
              data: { url, filename }
            }, (response) => {
              if (response && response.success && response.downloadId) {
                const dlId = response.downloadId;
                chrome.runtime.sendMessage({
                  type: 'MERGE_PROGRESS',
                  data: { filename: message.data.filename, status: `[SAVING] ${filename} (ID: ${dlId})` }
                });

                // Wait for background to report completion
                chrome.runtime.sendMessage({
                  type: 'WAIT_FOR_DOWNLOAD',
                  data: { downloadId: dlId }
                }, (waitResponse) => {
                  chrome.runtime.sendMessage({
                    type: 'MERGE_PROGRESS',
                    data: { filename: message.data.filename, status: `[${(waitResponse?.state || 'UNKNOWN').toUpperCase()}] ${filename}` }
                  });
                  resolve({ success: true, downloadId: dlId });
                });
              } else {
                const err = response?.error || 'Unknown error';
                chrome.runtime.sendMessage({
                  type: 'MERGE_PROGRESS',
                  data: { filename: message.data.filename, status: `[ERR] ${filename}: ${err}` }
                });
                resolve({ success: false, error: err });
              }
            });
          });
        }

        await Promise.all(workers);
        chrome.runtime.sendMessage({
          type: 'MERGE_PROGRESS',
          data: { filename, status: `DEBUG: Fetch Phase Complete. Fragments in memory: ${downloadQueue.length}` }
        });

        // 3. Assemble and Download
        const contentType = (filename && filename.endsWith('.mp4')) ? 'video/mp4' : 'video/mp2t';
        chrome.runtime.sendMessage({
          type: 'MERGE_PROGRESS',
          data: { filename, status: `DEBUG: Assembling final Blob...` }
        });

        const blob = new Blob(segmentBuffers, { type: contentType });
        const blobUrl = URL.createObjectURL(blob);

        if (folderName) {
          chrome.runtime.sendMessage({
            type: 'MERGE_PROGRESS',
            data: { filename, status: `DEBUG: Starting Save Phase in folder: ${folderName}` }
          });

          // Playlist
          if (message.data.m3u8Content) {
            const m3u8Blob = new Blob([message.data.m3u8Content], { type: 'application/vnd.apple.mpegurl' });
            const m3u8BlobUrl = URL.createObjectURL(m3u8Blob);
            await downloadViaBackground(m3u8BlobUrl, `${folderName}/playlist.m3u8`);
            setTimeout(() => URL.revokeObjectURL(m3u8BlobUrl), 10000);
          }
          
          // Download fragments STRICTLY sequentially
          let fCount = 0;
          for (const itemToDownload of downloadQueue) {
            fCount++;
            const fragBlob = new Blob([itemToDownload.data], { type: contentType });
            const fragUrl = URL.createObjectURL(fragBlob);
            
            chrome.runtime.sendMessage({
              type: 'MERGE_PROGRESS',
              data: { filename, status: `[SAVING] ${fCount}/${downloadQueue.length}: ${itemToDownload.filename}` }
            });

            await downloadViaBackground(fragUrl, itemToDownload.filename);
            setTimeout(() => URL.revokeObjectURL(fragUrl), 2000);
          }
        }

        chrome.runtime.sendMessage({
          type: 'MERGE_PROGRESS',
          data: { filename, status: `Finalizing merged video: ${filename}` }
        });

        const result = await downloadViaBackground(blobUrl, filename);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
        
        if (result.success && result.downloadId) {
          chrome.downloads.show(result.downloadId);
        }
        sendResponse({ success: result.success, downloadId: result.downloadId, error: result.error });

      } catch (e) {
        console.error('Offscreen PRO: Merge failed:', e);
        chrome.runtime.sendMessage({
          type: 'MERGE_PROGRESS',
          data: { filename: message.data.filename, status: `CRITICAL ERROR: ${e.message}` }
        });
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; 
  }
});
