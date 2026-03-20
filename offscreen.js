/**
 * Fluxon Offscreen Script
 * Handles fetching segments and merging them into a single Blob.
 */

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'MERGE_M3U8') {
    try {
      const { playlistUrl, segmentUrls, filename } = message.data;
      console.log(`Offscreen: Starting merge for ${filename} (${segmentUrls.length} segments)`);

      // 1. Fetch all segments
      const segmentData = [];
      for (let i = 0; i < segmentUrls.length; i++) {
        const url = segmentUrls[i];
        // Send progress update
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

      // 3. Create Blob and Download
      const blob = new Blob([mergedArray], { type: 'video/mp2t' }); // Default TS type
      const url = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        // Clean up URL after download starts
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        sendResponse({ success: true, downloadId });
      });

    } catch (e) {
      console.error('Offscreen: Merge failed:', e);
      sendResponse({ success: false, error: e.message });
    }
    return true; // Keep channel open
  }
});
