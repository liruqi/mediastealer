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
    console.log(`Offscreen: Starting MUX for ${filename}`);

    (async () => {
      let videoSamplesAdded = 0;
      let audioSamplesAdded = 0;
      let videoExpected = 0;
      let audioExpected = 0;
      let isFinalized = false;

      try {
        const videoBlob = await MediaDB.getBlob(videoKey);
        const audioBlob = audioKey ? await MediaDB.getBlob(audioKey) : null;
        if (!videoBlob) throw new Error("Video source blob not found");

        const videoArrayBuffer = await videoBlob.arrayBuffer();
        const audioArrayBuffer = audioBlob ? await audioBlob.arrayBuffer() : null;

        const videoMp4 = MP4Box.createFile();
        const audioMp4 = MP4Box.createFile();
        
        let muxer = null;

        const checkFinished = async () => {
          if (isFinalized) return;
          const vDone = videoExpected === 0 || videoSamplesAdded >= videoExpected;
          const aDone = audioExpected === 0 || audioSamplesAdded >= audioExpected;

          if (vDone && aDone) {
            isFinalized = true;
            console.log(`Offscreen: [DEBUG] MUX Conditions met. V:${videoSamplesAdded}/${videoExpected}, A:${audioSamplesAdded}/${audioExpected}`);
            chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[MUXING] Finalizing...` } });
            
            try {
              console.log(`Offscreen: [DEBUG] Calling muxer.finalize()...`);
              muxer.finalize();
              const { buffer } = muxer.target;
              
              const finalBlob = new Blob([buffer], { type: 'video/mp4' });
              const blobUrl = URL.createObjectURL(finalBlob);
              const finalMB = (finalBlob.size / 1024 / 1024).toFixed(2);
              console.log(`MUX Complete. Final size: ${finalBlob.size} bytes (${finalMB} MB).`);

              if (itemId) {
                chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Muxing...' } });
              }

              chrome.runtime.sendMessage({
                type: 'DOWNLOAD_INTERNAL',
                data: { url: blobUrl, filename: filename, showFile: true }
              }, (resp) => {
                const err = resp?.error || (chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
                if (err) {
                   chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX download failed: ${err}` } });
                   if (itemId) chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Error' } });
                } else {
                   chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[COMPLETE] MUX file saved (${finalMB} MB)` } });
                   if (itemId && resp?.downloadId) {
                      chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Complete', downloadId: resp.downloadId } });
                   }
                }
                setTimeout(() => {
                  URL.revokeObjectURL(blobUrl);
                  MediaDB.deleteBlob(videoKey);
                  if (audioKey) MediaDB.deleteBlob(audioKey);
                }, 15000);
              });
            } catch (finalizeErr) {
              console.error(`Offscreen: [DEBUG] MUX Finalization error:`, finalizeErr);
              chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX Finalization: ${finalizeErr.message}` } });
            }
          }
        };

        // Video Extraction
        videoMp4.onReady = (info) => {
          const vTrack = info.videoTracks[0];
          if (!vTrack) { videoExpected = 0; checkFinished(); return; }
          videoExpected = vTrack.nb_samples;
          let avccData = null;
          
          if (!muxer) {
            console.log(`Offscreen: [DEBUG] Initializing Muxer. vTrack:`, vTrack);
            const vTrackBox = videoMp4.getTrackById(vTrack.id);
            const entry = vTrackBox.mdia.minf.stbl.stsd.entries[0];
            const box = entry.avcC || entry.hvcC || entry.vpcC;
            
            if (box && typeof box.write === 'function') {
               try {
                 const ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                 box.write(ds);
                 avccData = new Uint8Array(ds.buffer, 8); // Skip 8-byte header (size + type)
                 console.log(`Offscreen: [DEBUG] Serialized avcC, size: ${avccData.length}`);
               } catch (e) {
                 console.error(`Offscreen: [DEBUG] Failed to serialize avcC:`, e);
               }
            }

            muxer = new Mp4Muxer.Muxer({
              target: new Mp4Muxer.ArrayBufferTarget(),
              video: {
                codec: 'avc',
                width: vTrack.video.width || 1920,
                height: vTrack.video.height || 1080,
                avcc: avccData,
                colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }
              },
              audio: audioArrayBuffer ? {
                codec: 'aac',
                sampleRate: (info.audioTracks && info.audioTracks[0]) ? info.audioTracks[0].audio.sample_rate : 44100,
                numberOfChannels: (info.audioTracks && info.audioTracks[0]) ? info.audioTracks[0].audio.channel_count : 2
              } : undefined,
              fastStart: 'in-memory'
            });

            // SAFETY PATCH: Force colorSpace availability even if Muxer fails to set it
            if (muxer.videoTrack && !muxer.videoTrack.info.decoderConfig) {
               console.warn(`Offscreen: [DEBUG] Muxer failed to create decoderConfig. Patching...`);
               muxer.videoTrack.info.decoderConfig = {
                  colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }
               };
            }
            console.log(`Offscreen: [DEBUG] Muxer initialized:`, muxer);
          }

          videoMp4.setExtractionOptions(vTrack.id, null, { nbSamples: vTrack.nb_samples });
          videoMp4.onSamples = (id, user, samples) => {
            if (isFinalized) return;
            for (let s of samples) { 
              // MP4-Muxer expects CTS OFFSET, not Absolute CTS
              const ctsOffset = (s.cts - s.dts) / vTrack.timescale * 1e6;
              const chunkMeta = { cts: ctsOffset };
              
              if (videoSamplesAdded === 0) {
                chunkMeta.decoderConfig = {
                  codec: 'avc1.42E01E', // Default if serializing fails
                  width: vTrack.video.width || 1920,
                  height: vTrack.video.height || 1080,
                  description: avccData,
                  colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }
                };
                console.log(`Offscreen: [DEBUG] First Video Chunk Meta:`, chunkMeta);
              }

              if (!isFinalized) {
                muxer.addVideoChunkRaw(
                  new Uint8Array(s.data),
                  s.is_sync ? 'key' : 'delta',
                  (s.dts / vTrack.timescale) * 1e6,
                  (s.duration / vTrack.timescale) * 1e6,
                  chunkMeta
                );
              }
              videoSamplesAdded++; 
            }
            if (videoSamplesAdded % 100 === 0 || videoSamplesAdded === videoExpected) {
              chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[MUXING] Video: ${videoSamplesAdded}/${videoExpected}` } });
            }
            checkFinished();
          };
          videoMp4.start();
        };

        // Audio Extraction
        audioMp4.onReady = (info) => {
          const aTrack = info.audioTracks[0];
          if (!aTrack) { audioExpected = 0; checkFinished(); return; }
          audioExpected = aTrack.nb_samples;
          
          audioMp4.setExtractionOptions(aTrack.id, null, { nbSamples: aTrack.nb_samples });
          audioMp4.onSamples = (id, user, samples) => {
            if (isFinalized) return;
            for (let s of samples) { 
              if (!isFinalized) {
                muxer.addAudioChunkRaw(
                  new Uint8Array(s.data),
                  'key',
                  (s.dts / aTrack.timescale) * 1e6,
                  (s.duration / aTrack.timescale) * 1e6
                );
              }
              audioSamplesAdded++; 
            }
            if (audioSamplesAdded % 100 === 0 || audioSamplesAdded === audioExpected) {
              chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[MUXING] Audio: ${audioSamplesAdded}/${audioExpected}` } });
            }
            checkFinished();
          };
          audioMp4.start();
        };

        // Safety Timeout (60s)
        setTimeout(() => {
          if (!isFinalized) {
            chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX Timed out. V:${videoSamplesAdded}/${videoExpected} A:${audioSamplesAdded}/${audioExpected}` } });
            if (itemId) chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Error' } });
          }
        }, 60000);

        videoArrayBuffer.fileStart = 0;
        videoMp4.appendBuffer(videoArrayBuffer);
        if (audioArrayBuffer) {
          audioArrayBuffer.fileStart = 0;
          audioMp4.appendBuffer(audioArrayBuffer);
        }

      } catch (e) {
        console.error('Offscreen MUX critical error:', e);
        chrome.runtime.sendMessage({ type: 'MERGE_PROGRESS', data: { filename, status: `[ERROR] MUX Exception: ${e.message}` } });
        if (itemId) chrome.runtime.sendMessage({ type: 'UPDATE_ITEM_STATUS', data: { itemId, status: 'Error' } });
      }
    })();
    sendResponse({ success: true });
    return true;
  }
});
