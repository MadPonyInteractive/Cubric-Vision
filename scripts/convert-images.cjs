#!/usr/bin/env node
/**
 * Batch convert source images (PNG/JPG/JPEG) to optimized WebP for the website carousels.
 *
 * Usage:
 *   node scripts/convert-images.cjs --prefix=<name> --out=<out-prefix> [options]
 *
 * Required:
 *   --prefix=<name>      Source filename prefix to match (e.g. "pony" matches "pony (1).png", "pony-01.png", "pony_01.png").
 *   --out=<out-prefix>   Output filename prefix (e.g. "sdxl-pony" yields "sdxl-pony-01.webp").
 *
 * Optional:
 *   --src=<path>         Source directory. Default: brand assets marketing-media.
 *   --dest=<path>        Destination directory. Default: website vision-media.
 *   --quality=<1-100>    WebP quality. Default: 85.
 *   --start=<n>          Starting index for output numbering. Default: 1.
 *   --pad=<n>            Zero-pad width for index. Default: 2.
 *   --dry                Print plan, write nothing.
 *
 * Examples:
 *   node scripts/convert-images.cjs --prefix=pony --out=sdxl-pony
 *   node scripts/convert-images.cjs --prefix=flux-real --out=flux-real --quality=88
 *   node scripts/convert-images.cjs --prefix=ill-beauty --out=sdxl-ill-beauty --start=10
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DEFAULT_SRC = 'C:\\AI\\Mpi\\Cubric Studio Brand Assets\\marketing-media';
const DEFAULT_DEST = 'C:\\AI\\Mpi\\Cubric Studio (Website)\\assets\\vision-media';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
  })
);

if (!args.prefix || !args.out) {
  console.error('Missing required --prefix=<name> and/or --out=<out-prefix>.');
  console.error('Run with --help for usage.');
  process.exit(1);
}

const SRC_DIR = args.src || DEFAULT_SRC;
const DEST_DIR = args.dest || DEFAULT_DEST;
const QUALITY = args.quality ? parseInt(args.quality, 10) : 85;
const START = args.start ? parseInt(args.start, 10) : 1;
const PAD = args.pad ? parseInt(args.pad, 10) : 2;
const DRY = !!args.dry;
const PREFIX = args.prefix;
const OUT_PREFIX = args.out;

const EXTENSIONS = /\.(png|jpe?g)$/i;
const NUMBER_RE = /(\d+)/g;

function extractNumber(filename) {
  const matches = [...filename.matchAll(NUMBER_RE)];
  if (!matches.length) return Infinity;
  return parseInt(matches[matches.length - 1][1], 10);
}

async function run() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(DEST_DIR)) {
    console.error(`Destination directory not found: ${DEST_DIR}`);
    process.exit(1);
  }

  const prefixLower = PREFIX.toLowerCase();
  const files = fs.readdirSync(SRC_DIR)
    .filter(f => EXTENSIONS.test(f) && f.toLowerCase().startsWith(prefixLower))
    .map(f => ({ file: f, num: extractNumber(f) }))
    .sort((a, b) => a.num - b.num);

  if (!files.length) {
    console.error(`No files matching prefix "${PREFIX}" in ${SRC_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} source images for prefix "${PREFIX}"`);
  console.log(`Source:      ${SRC_DIR}`);
  console.log(`Destination: ${DEST_DIR}`);
  console.log(`Output:      ${OUT_PREFIX}-NN.webp (start=${START}, pad=${PAD}, quality=${QUALITY})`);
  if (DRY) console.log('(dry run, nothing written)');
  console.log('');

  let idx = START;
  for (const { file } of files) {
    const srcPath = path.join(SRC_DIR, file);
    const destName = `${OUT_PREFIX}-${String(idx).padStart(PAD, '0')}.webp`;
    const destPath = path.join(DEST_DIR, destName);

    if (DRY) {
      console.log(`${file} -> ${destName}`);
    } else {
      const info = await sharp(srcPath)
        .webp({ quality: QUALITY })
        .toFile(destPath);
      console.log(`${file} -> ${destName} (${(info.size / 1024).toFixed(1)} KB)`);
    }
    idx++;
  }

  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
