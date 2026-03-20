/**
 * Fluxon Offscreen Script
 * Handles fetching segments and merging them into a single Blob.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MERGE_M3U8') {
    const { segments, sequenceStart, mapUrl, filename, folderName } = message.data;
    console.log(`Offscreen: Starting Pro merge for ${filename} (${segments.length} segments)`);

    (async () => {
      try {
        const keyCache = new Map(); // url -> CryptoKey
        const downloadQueue = [];
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
            chrome.runtime.sendMessage({
              type: 'DOWNLOAD_INTERNAL',
              data: { url, filename, showFile }
            }, (response) => {
              if (response && response.success && response.downloadId) {
                const dlId = response.downloadId;
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

        // 1. Process Map
        if (mapUrl) {
          chrome.runtime.sendMessage({
            type: 'MERGE_PROGRESS',
            data: { filename, status: `Fetching Initialization Map: ${mapUrl}` }
          });
          const mapBuf = await fetchWithRetry(mapUrl);
          segmentBuffers[0] = mapBuf;

          if (folderName) {
            const mapExt = mapUrl.split('?')[0].split('.').pop() || 'mp4';
            downloadQueue.push({
              sourceUrl: mapUrl,
              data: mapBuf,
              filename: `${folderName}/init.${mapExt}`
            });
          }
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

              if (folderName) {
                let ext = seg.url.split('?')[0].split('.').pop() || 'ts';
                if (isFMP4 && (ext === 'm4s' || ext === 'mp4')) ext = 'mp4';

                downloadQueue.push({
                  sourceUrl: seg.url,
                  data: decrypted,
                  filename: `${folderName}/fragment_${String(index + 1).padStart(3, '0')}.${ext}`
                });
              }

              completed++;
              chrome.runtime.sendMessage({
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

        if (folderName) {
          // Playlist
          if (message.data.m3u8Content) {
            const m3u8Blob = new Blob([message.data.m3u8Content], { type: 'application/vnd.apple.mpegurl' });
            const m3u8BlobUrl = URL.createObjectURL(m3u8Blob);
            await downloadViaBackground(m3u8BlobUrl, `${folderName}/playlist.m3u8`, false);
            setTimeout(() => URL.revokeObjectURL(m3u8BlobUrl), 10000);
          }

          // Fragments
          for (const itemToDownload of downloadQueue) {
            const fragBlob = new Blob([itemToDownload.data], { type: contentType });
            const fragUrl = URL.createObjectURL(fragBlob);
            await downloadViaBackground(fragUrl, itemToDownload.filename, false);
            setTimeout(() => URL.revokeObjectURL(fragUrl), 2000);
          }
        }

        if (message.data.shouldSaveToDB && message.data.muxKey) {
          chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[CACHED] Saving to Disk & MediaDB: ${filename}` } });
          await MediaDB.saveBlob(message.data.muxKey, blob);
          await downloadViaBackground(blobUrl, filename, false);
          sendResponse({ success: true, muxKey: message.data.muxKey });
        } else {
          chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `Finalizing merge & saving: ${filename}` } });
          const result = await downloadViaBackground(blobUrl, filename, true);
          sendResponse({ success: result.success, downloadId: result.downloadId, error: result.error });
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

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
          Input, Mp4InputFormat, BufferSource,
          Output, Mp4OutputFormat, BufferTarget,
          EncodedVideoPacketSource, EncodedAudioPacketSource,
          EncodedPacketSink
        } = Mediabunny;

        // ── Open source files with mediabunny Input ────────────────────────
        const videoInput = new Input({
          formats: [new Mp4InputFormat()],
          source: new BufferSource(videoArrayBuffer)
        });
        const audioInput = audioArrayBuffer ? new Input({
          formats: [new Mp4InputFormat()],
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
              chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[MUXING] Video: ${videoCount} packets` } });
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
              chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[MUXING] Audio: ${audioCount} packets` } });
            }
          }
          console.log(`Offscreen: [MUX] Audio pump done. ${audioCount} packets`);
        };

        chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: '[MUXING] Pumping packets…' } });
        await Promise.all([pumpVideo(), pumpAudio()]);

        // ── Finalize ───────────────────────────────────────────────────────
        console.log(`Offscreen: [MUX] Finalizing. V:${videoCount} A:${audioCount}`);
        chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: '[MUXING] Finalizing…' } });
        await mbOutput.finalize();

        const buffer = mbOutput.target.buffer;
        const finalBlob = new Blob([buffer], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(finalBlob);
        const finalMB = (finalBlob.size / 1024 / 1024).toFixed(2);
        console.log(`Offscreen: [MUX] Complete — ${finalMB} MB`);

        if (itemId) chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Muxing…' } });

        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_INTERNAL',
          data: { url: blobUrl, filename, showFile: true }
        }, (resp) => {
          const err = resp?.error || chrome.runtime.lastError?.message;
          if (err) {
            chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX download failed: ${err}` } });
            if (itemId) chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Error' } });
          } else {
            chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[COMPLETE] MUX saved (${finalMB} MB)` } });
            if (itemId && resp?.downloadId) chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Complete', downloadId: resp.downloadId } });
          }
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            MediaDB.deleteBlob(videoKey);
            if (audioKey) MediaDB.deleteBlob(audioKey);
          }, 15000);
        });

      } catch (e) {
        console.error('Offscreen: [MUX] Critical error:', e);
        chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX: ${e.message}` } });
        if (itemId) chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Error' } });
      }
    })();
    sendResponse({ success: true });
    return true;
  }
});
