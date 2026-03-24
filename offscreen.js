/**
 * Fluxon Offscreen Script
 * Handles fetching segments and merging them into a single Blob.
 * In Chrome, this runs in a dedicated offscreen document.
 * In Firefox, this runs directly in the background Event Page.
 */

function dispatchToBackground(msg, callback) {
  // If we're inside the background context (Firefox or Chrome via importScripts) and handleBackgroundMessage is available
  if (typeof self.handleBackgroundMessage === 'function') {
    self.handleBackgroundMessage(msg, {}, callback || (() => { }));
  } else {
    if (callback) chrome.runtime.sendMessage(msg, callback);
    else chrome.runtime.sendMessage(msg).catch(() => { });
  }
}

async function sendToNativeApp(blob, safeFilename, filename) {
  try {
    const buffer = await blob.arrayBuffer();
    const chunkSize = 1048576; // 1 MB
    const totalChunks = Math.ceil(buffer.byteLength / chunkSize);
    const fileId = 'file_' + Date.now();

    function arrayBufferToBase64(buf) {
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    for (let i = 0; i < totalChunks; i++) {
      const chunk = buffer.slice(i * chunkSize, (i + 1) * chunkSize);
      const chunkBase64 = arrayBufferToBase64(chunk);
      dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[NATIVE] Appending chunk ${i+1}/${totalChunks}...` } });

      await new Promise((resolve, reject) => {
        const msg = { type: "save_chunk", fileId, fileName: safeFilename, data: chunkBase64, isLast: (i === totalChunks - 1) };
        if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendNativeMessage) {
          browser.runtime.sendNativeMessage("application.id", msg).then(resolve).catch(reject);
        } else if (chrome.runtime && chrome.runtime.sendNativeMessage) {
          chrome.runtime.sendNativeMessage("application.id", msg, (resp) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(resp);
          });
        } else {
          reject(new Error("sendNativeMessage not available"));
        }
      });
    }
    return true;
  } catch (e) {
    console.error("Native send error:", e);
    return false;
  }
}

self.handleOffscreenMessage = (message, sender, sendResponse) => {
  if (message.type === 'MERGE_M3U8') {
    const { segments, sequenceStart, mapUrl, filename, folderName } = message.data;
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

        // Helper: Download via Background
        async function downloadViaBackground(url, filename, showFile = false) {
          return new Promise((resolve) => {
            dispatchToBackground({
              type: 'DOWNLOAD_INTERNAL',
              data: { url, filename, showFile }
            }, (response) => {
              if (response && response.success && response.downloadId) {
                const dlId = response.downloadId;
                dispatchToBackground({
                  type: 'WAIT_FOR_DOWNLOAD',
                  data: { downloadId: dlId }
                }, (waitResponse) => {
                  dispatchToBackground({
                    type: 'MERGE_PROGRESS',
                    data: { filename: message.data.filename, status: `[${(waitResponse?.state || 'UNKNOWN').toUpperCase()}] ${filename}` }
                  });
                  resolve({ success: true, downloadId: dlId });
                });
              } else {
                const err = response?.error || 'Unknown error';
                dispatchToBackground({
                  type: 'MERGE_PROGRESS',
                  data: { filename: message.data.filename, status: `[ERR] ${filename}: ${err}` }
                });
                resolve({ success: false, error: err });
              }
            });
          });
        }

        // 1. Process Map
        if (mapUrl) {
          dispatchToBackground({
            type: 'MERGE_PROGRESS',
            data: { filename, status: `Fetching Initialization Map: ${mapUrl}` }
          });
          const mapBuf = await fetchWithRetry(mapUrl);
          segmentBuffers[0] = mapBuf;
        }

        // 2. Process Segments
        const isFMP4 = !!mapUrl || segments.some(s => s.url.includes('.m4s'));
        const queue = [...segments.entries()];
        const workers = Array(5).fill(null).map(async () => {
          while (queue.length > 0) {
            const [index, seg] = queue.shift();
            try {
              const buffer = await fetchWithRetry(seg.url);
              const decrypted = await decryptSegment(buffer, seg.key, index);
              segmentBuffers[mapUrl ? index + 1 : index] = decrypted;

              completed++;
              dispatchToBackground({
                type: 'MERGE_PROGRESS',
                data: { filename, current: completed, total: segments.length, status: `Fetched ${completed}/${segments.length}` }
              });
            } catch (e) {
              console.error(`Worker failed on segment ${index}:`, e);
              throw e;
            }
          }
        });

        await Promise.all(workers);

        // 3. Assemble and Download
        let contentType = 'video/mp2t';
        if (filename) {
          if (filename.endsWith('.mp4')) contentType = 'video/mp4';
          else if (filename.endsWith('.m4a')) contentType = 'audio/mp4';
        }

        const blob = new Blob(segmentBuffers, { type: contentType });
        const blobUrl = URL.createObjectURL(blob);

        if (message.data.shouldSaveToDB && message.data.muxKey) {
          dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[CACHED] Saving to MediaDB: ${filename}` } });
          await MediaDB.saveBlob(message.data.muxKey, blob);
          sendResponse({ success: true, muxKey: message.data.muxKey });
        } else {
          dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `Finalizing merge & saving: ${filename}` } });
          const result = await downloadViaBackground(blobUrl, filename, true);
          if (!result.success) {
              const safeFilename = filename.split('/').pop();
              dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[FALLBACK] Sending file to Native App for ${safeFilename}...` } });
              
              // Try native app transmission for Safari
              const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
              let nativeSuccess = false;
              if (isSafariBrowser || !result.success) {
                // We have a blob URL here, unfortunately we need the actual blob
                // It's a bit hard to reconstruct it here so we'll fetch it from the blobUrl
                try {
                  const blobFetch = await fetch(blobUrl);
                  const fetchedBlob = await blobFetch.blob();
                  nativeSuccess = await sendToNativeApp(fetchedBlob, safeFilename, filename);
                } catch(e) { console.error('Error sending native:', e); }
              }

              if (nativeSuccess) {
                sendResponse({ success: true, viaNative: true });
              } else {
                try {
                  dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[FALLBACK] Native failed. Attempting <a> download...` } });
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = safeFilename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  sendResponse({ success: true });
                } catch (fallbackErr) {
                  sendResponse({ success: false, error: result.error + ' | Fallback err: ' + fallbackErr.message });
                }
              }
            } else {
              sendResponse({ success: result.success, downloadId: result.downloadId, error: result.error });
            }
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

      } catch (e) {
        console.error('Offscreen PRO: Merge failed:', e);
        dispatchToBackground({
          type: 'MERGE_PROGRESS',
          data: { filename: message.data.filename, status: `CRITICAL ERROR: ${e.message}` }
        });
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;

  } else if (message.type === 'MUX_MEDIA') {
    const { videoKey, audioKey, filename, itemId } = message.data;
    console.log(`Offscreen: [MUX] Starting for ${filename} [mediabunny Input→Output]`);

    (async () => {
      try {
        const videoBlob = await MediaDB.getBlob(videoKey);
        const audioBlob = audioKey ? await MediaDB.getBlob(audioKey) : null;
        if (!videoBlob) throw new Error('Video source blob not found');

        const videoArrayBuffer = await videoBlob.arrayBuffer();
        const audioArrayBuffer = audioBlob ? await audioBlob.arrayBuffer() : null;

        const {
          Input, Mp4InputFormat, MpegTsInputFormat, BufferSource,
          Output, Mp4OutputFormat, BufferTarget,
          EncodedVideoPacketSource, EncodedAudioPacketSource,
          EncodedPacketSink
        } = self.Mediabunny;

        // ── Open source files with mediabunny Input ────────────────────────
        const videoInput = new Input({
          formats: [new Mp4InputFormat(), new MpegTsInputFormat()],
          source: new BufferSource(videoArrayBuffer)
        });
        const audioInput = audioArrayBuffer ? new Input({
          formats: [new Mp4InputFormat(), new MpegTsInputFormat()],
          source: new BufferSource(audioArrayBuffer)
        }) : null;

        const videoTracks = await videoInput.getVideoTracks();
        if (!videoTracks.length) throw new Error('No video track found in source');
        const vTrack = videoTracks[0];

        const audioTracks = audioInput ? await audioInput.getAudioTracks() : [];
        const aTrack = audioTracks[0] ?? null;

        const vDecoderConfig = await vTrack.getDecoderConfig();
        console.log(`Offscreen: [MUX] Video codec: ${vTrack.codec} decoderConfig:`, vDecoderConfig);
        if (aTrack) {
          const aDecoderConfig = await aTrack.getDecoderConfig();
          console.log(`Offscreen: [MUX] Audio codec: ${aTrack.codec} decoderConfig:`, aDecoderConfig);
        }

        // ── Create mediabunny Output ───────────────────────────────────────
        const mbVideoSource = new EncodedVideoPacketSource(vTrack.codec);
        const mbAudioSource = aTrack ? new EncodedAudioPacketSource(aTrack.codec) : null;

        const mbOutput = new Output({
          format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
          target: new BufferTarget()
        });
        mbOutput.addVideoTrack(mbVideoSource);
        if (mbAudioSource) mbOutput.addAudioTrack(mbAudioSource);
        await mbOutput.start();
        console.log('Offscreen: [MUX] Output started');

        // ── Stream packets from input to output ────────────────────────────
        // Run video and audio pipelines concurrently
        const vSink = new EncodedPacketSink(vTrack);
        const aSink = aTrack ? new EncodedPacketSink(aTrack) : null;

        let videoCount = 0;
        let audioCount = 0;

        const pumpVideo = async () => {
          let firstPacket = true;
          for await (const packet of vSink.packets()) {
            let meta;
            if (firstPacket) {
              meta = { decoderConfig: vDecoderConfig };
              console.log(`Offscreen: [MUX] First video packet pts=${packet.timestamp.toFixed(4)}s type=${packet.type}`);
              firstPacket = false;
            }
            await mbVideoSource.add(packet, meta);
            videoCount++;
            if (videoCount % 100 === 0) {
              dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[MUXING] Video: ${videoCount} packets` } });
            }
          }
          console.log(`Offscreen: [MUX] Video pump done. ${videoCount} packets`);
        };

        const pumpAudio = async () => {
          if (!aSink || !mbAudioSource) return;
          let firstPacket = true;
          const aDecoderConfig = await aTrack.getDecoderConfig();
          for await (const packet of aSink.packets()) {
            let meta;
            if (firstPacket) {
              meta = { decoderConfig: aDecoderConfig };
              console.log(`Offscreen: [MUX] First audio packet pts=${packet.timestamp.toFixed(4)}s`);
              firstPacket = false;
            }
            await mbAudioSource.add(packet, meta);
            audioCount++;
            if (audioCount % 100 === 0) {
              dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[MUXING] Audio: ${audioCount} packets` } });
            }
          }
          console.log(`Offscreen: [MUX] Audio pump done. ${audioCount} packets`);
        };

        dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: '[MUXING] Pumping packets…' } });
        await Promise.all([pumpVideo(), pumpAudio()]);

        // ── Finalize ───────────────────────────────────────────────────────
        console.log(`Offscreen: [MUX] Finalizing. V:${videoCount} A:${audioCount}`);
        dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: '[MUXING] Finalizing…' } });
        await mbOutput.finalize();

        const buffer = mbOutput.target.buffer;
        const finalBlob = new Blob([buffer], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(finalBlob);
        const finalMB = (finalBlob.size / 1024 / 1024).toFixed(2);
        console.log(`Offscreen: [MUX] Complete — ${finalMB} MB`);

        if (itemId) dispatchToBackground({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Muxing…' } });

        // Attempt to download via background, then fallback to native, then <a> tag
        const safeFilename = filename.split('/').pop();
        console.log(`Offscreen: [DEBUG] Using background messaging for download...`);
        dispatchToBackground({
          type: 'DOWNLOAD_INTERNAL',
          data: { url: blobUrl, filename, showFile: true }
        }, async (resp) => {
          const err = resp?.error || chrome.runtime.lastError?.message;
          if (err) {
            const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            let nativeSuccess = false;
            if (isSafariBrowser || err) {
              dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[FALLBACK] Sending video to Native App...` } });
              nativeSuccess = await sendToNativeApp(finalBlob, safeFilename, filename);
            }

            if (nativeSuccess) {
              dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[COMPLETE] MUX Native Save Complete` } });
              if (itemId) dispatchToBackground({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Complete' } });
            } else {
              try {
                dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[FALLBACK] Native failed. Attempting <a> download...` } });
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = safeFilename;
                a.target = '_blank'; // Sometimes helps in Safari
                document.body.appendChild(a);
                a.click();
                
                setTimeout(() => {
                  if (document.body.contains(a)) document.body.removeChild(a);
                }, 1000);

                dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[COMPLETE] MUX saved via fallback (Check browser's native download list)` } });
                if (itemId) dispatchToBackground({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Complete' } });

                // Show manual button too if we are in a tab (Safari fallback)
                if (typeof document !== 'undefined') {
                  const statusDiv = document.getElementById('status');
                  const btn = document.getElementById('downloadBtn');
                  if (statusDiv) statusDiv.textContent = `Merge complete. If download did not start, click below:`;
                  if (btn) {
                    btn.href = blobUrl;
                    btn.download = safeFilename;
                    btn.style.display = 'inline-block';
                  }
                  // Bring tab to foreground on Safari if auto-download might have failed
                  if (chrome.tabs && chrome.tabs.getCurrent) {
                    chrome.tabs.getCurrent((tab) => {
                      if (tab && !tab.active) {
                        chrome.tabs.update(tab.id, { active: true });
                        chrome.windows.update(tab.windowId, { focused: true });
                      }
                    });
                  }
                }
              } catch (fallbackErr) {
                console.error('Offscreen: [MUX] Fallback download failed:', fallbackErr);
                dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX download failed: ${err} | Fallback: ${fallbackErr.message}` } });
                if (itemId) dispatchToBackground({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Error' } });
              }
            }
          } else {
            dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[COMPLETE] MUX saved (${finalMB} MB)` } });
            if (itemId && resp?.downloadId) dispatchToBackground({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Complete', muxedDownloadId: resp.downloadId } });
          }
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            MediaDB.deleteBlob(videoKey);
            if (audioKey) MediaDB.deleteBlob(audioKey);
          }, 15000);
        });

      } catch (e) {
        console.error('Offscreen: [MUX] Critical error:', e);
        dispatchToBackground({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX: ${e.message}` } });
        if (itemId) dispatchToBackground({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Error' } });
      }
    })();
    sendResponse({ success: true });
    return true;
  }
};

chrome.runtime.onMessage.addListener(self.handleOffscreenMessage);
