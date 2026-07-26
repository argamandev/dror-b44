// Generates the PWA/app icons from an SVG of the Dawn orb (Task N1).
// Run once with `node scripts/make-icons.mjs` (requires `sharp` as a
// devDependency); output is committed to public/icons/ so this script is
// for reproducibility, not a build step.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/icons');

// Dawn orb gradient stops — identical to orb.js's no-WebGL fallback
// (`radial-gradient(circle at 40% 35%, #FBF6EF 0%, #F6D9C4 30%, #A9B9F9 60%, #6B71F6 100%)`),
// reproduced as an SVG radialGradient so the app icons read as the same orb.
const GRADIENT_STOPS = [
  { offset: '0%', color: '#FBF6EF' },
  { offset: '30%', color: '#F6D9C4' },
  { offset: '60%', color: '#A9B9F9' },
  { offset: '100%', color: '#6B71F6' },
];

function gradientDefs(id) {
  const stops = GRADIENT_STOPS.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
  return `<radialGradient id="${id}" cx="40%" cy="35%" r="75%">${stops}</radialGradient>`;
}

// Regular icon: Dawn-orb disc on a transparent background (used for the
// apple-touch-icon and the manifest's 192/512 "any" purpose icons).
function iconSvg(size) {
  const r = size * 0.46;
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${gradientDefs('g')}</defs>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)"/>
</svg>`;
}

// Maskable icon: ivory full-bleed square with the disc at 70% of the canvas
// so Android's adaptive-icon mask (circle/squircle/rounded-square/...) never
// clips into the orb itself.
function maskableSvg(size) {
  const discR = size * 0.35;
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${gradientDefs('g')}</defs>
  <rect width="${size}" height="${size}" fill="#FBF6EF"/>
  <circle cx="${c}" cy="${c}" r="${discR}" fill="url(#g)"/>
</svg>`;
}

async function render(svg, size, filename) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, filename));
  console.log('wrote', filename);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await render(iconSvg(180), 180, 'icon-180.png');
  await render(iconSvg(192), 192, 'icon-192.png');
  await render(iconSvg(512), 512, 'icon-512.png');
  await render(maskableSvg(512), 512, 'icon-512-maskable.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
