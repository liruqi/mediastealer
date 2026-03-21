const fs = require('fs');
const path = require('path');

const targetDir = process.argv[2];

if (!targetDir) {
  console.error("Usage: node verify_merges.js <path_to_hls_folder>");
  process.exit(1);
}

console.log(`\n--- Verification Report for: ${targetDir} ---`);

const checks = [
  { name: 'Playlist', file: 'playlist.m3u8' },
  { name: 'Merged Video (Track)', file: 'merged_video.mp4' },
  { name: 'Merged Audio (Track)', file: 'merged_audio.m4a' },
  { name: 'Final Muxed MP4', file: '../' + path.basename(targetDir).replace('_hls', '.mp4') }
];

let allOk = true;
checks.forEach(c => {
  const fullPath = path.resolve(targetDir, c.file);
  const exists = fs.existsSync(fullPath);
  console.log(`[${exists ? 'OK' : 'MISSING'}] ${c.name}: ${c.file}`);
  if (!exists && c.name !== 'Merged Audio (Track)') allOk = false; // Audio is optional
});

const fragments = fs.readdirSync(targetDir).filter(f => f.startsWith('fragment_'));
console.log(`[INFO] Fragments found: ${fragments.length}`);

if (fragments.length === 0) {
  console.log("[WARNING] No fragments found!");
}

console.log(`--- Result: ${allOk ? 'PASSED' : 'FAILED'} ---\n`);
