/* Asset-authoring utility only; the site serves the committed outputs.
 * Uses the already available sharp utility, without adding a site dependency.
 * Run: node .github/hllv-visual-system/build_favicon.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const assets = path.resolve(__dirname, '../../hllv_tracker/assets');
const svg = fs.readFileSync(path.join(assets, 'infierno-favicon.svg'));

(async () => {
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(size =>
    sharp(svg, {density: 384}).resize(size, size).png().toBuffer()
  ));
  // ICO supports embedded PNG frames. Directory entries give browsers a native
  // 16, 32, or 48px image rather than making them resize a single bitmap.
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2); // Icon type.
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    directory[entry] = size;
    directory[entry + 1] = size;
    directory.writeUInt16LE(1, entry + 4); // Color planes.
    directory.writeUInt16LE(32, entry + 6); // RGBA bits per pixel.
    directory.writeUInt32LE(images[i].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  fs.writeFileSync(path.join(assets, 'infierno-favicon.ico'),
    Buffer.concat([directory, ...images]));
  await sharp(svg, {density: 384}).resize(180, 180).png()
    .toFile(path.join(assets, 'infierno-apple-touch-icon.png'));
})().catch(error => { console.error(error); process.exit(1); });
