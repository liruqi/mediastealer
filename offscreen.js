/**
 * Fluxon Offscreen Script
 * Handles fetching segments and merging them into a single Blob.
 */

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'MERGE_M3U8') {
    const { playlistUrl, segmentUrls, mapUrl, filename } = message.data;
    console.log(`Offscreen: Starting merge for ${filename} (${segmentUrls.length} segments)`);

    (async () => {
      try {
        const segmentData = [];
        
        // 0. Fetch Map (Initialization Segment) if present
        if (mapUrl) {
          chrome.runtime.sendMessage({
            type: 'MERGE_PROGRESS',
            data: { filename, current: 0, total: segmentUrls.length, status: 'Fetching Map...' }
          });
          const mResp = await fetch(mapUrl);
          if (mResp.ok) {
            segmentData.push(new Uint8Array(await mResp.arrayBuffer()));
          }
        }

        // 1. Fetch all segments
        for (let i = 0; i < segmentUrls.length; i++) {
          const url = segmentUrls[i];
          chrome.runtime.sendMessage({
            type: 'MERGE_PROGRESS',
            data: { filename, current: i + 1, total: segmentUrls.length }
          });

          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`Failed to fetch segment ${i}: ${url}`);
          const buffer = await resp.arrayBuffer();
          segmentData.push(new Uint8Array(buffer));
        }

        // 2. Concatenate
        const totalLength = segmentData.reduce((acc, curr) => acc + curr.length, 0);
        const mergedArray = new Uint8Array(totalLength);
        let offset = 0;
        for (const data of segmentData) {
          mergedArray.set(data, offset);
          offset += data.length;
        }

        // 3. Create Blob and Download Merged Video
        const blob = new Blob([mergedArray], { type: 'video/mp2t' });
        const blobUrl = URL.createObjectURL(blob);

        // 4. Download individual components into the folder (as requested)
        const { folderName } = message.data;
        
        // Save the playlist itself
        chrome.downloads.download({
          url: playlistUrl,
          filename: `${folderName}/playlist.m3u8`,
          saveAs: false
        });

        // Save segments (this might be noisy, but requested)
        // We'll only save a few or all? User said "all related .m4s fragments"
        // To avoid absolute chaos, we'll download them but they'll go to history.
        for (let i = 0; i < segmentUrls.length; i++) {
           chrome.downloads.download({
             url: segmentUrls[i],
             filename: `${folderName}/fragment_${String(i+1).padStart(3, '0')}.${segmentUrls[i].split('.').pop()}`,
             saveAs: false
           });
        }

        // Final Merged Video
        chrome.downloads.download({
          url: blobUrl,
          filename: filename,
          saveAs: false
        }, (downloadId) => {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          sendResponse({ success: true, downloadId });
          // Open folder and select the merged video (not directly supported to select, but show() opens folder)
          if (downloadId) chrome.downloads.show(downloadId);
        });

      } catch (e) {
        console.error('Offscreen: Merge failed:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; 
  }
});
