// Renders the full-bleed platform icons from public/icon.svg after `pwa-assets-generator` has made the rest.
// iOS and Android apply their own rounded/circular masks, so these drop the rounded tile; the Android maskable
// icon also drops the stitched rail (a circle mask would slice through it) and shrinks the spade into the safe zone.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const source = readFileSync('public/icon.svg', 'utf8');
const fullBleed = source.replace(' clip-path="url(#tile)"', '');
const maskable = fullBleed
  .replace(/\s*<!-- Stitched rail[^>]*-->\s*<rect[^>]*stroke-dasharray[^>]*\/>/, '')
  .replace('translate(141 131) scale(2.3)', 'translate(161 152) scale(1.9)');

if (fullBleed === source || maskable === fullBleed) throw new Error('icon.svg no longer matches the shapes this script expects');

await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile('public/apple-touch-icon-180x180.png');
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/maskable-icon-512x512.png');
console.log('✔ full-bleed apple-touch and maskable icons rendered');
