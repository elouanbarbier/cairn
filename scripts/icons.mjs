#!/usr/bin/env node
// Renders the app icons (PWA manifest, Apple home screen) from the Cairn mark, with Playwright's Chromium.
// Run from the repository root after changing the mark: node scripts/icons.mjs
import { chromium } from '@playwright/test';

const OUT = 'apps/web/public';
const BRAND = '#4F46E5';

/** The three stacked stones of the logo, white, centered in a square of `size`, filling `scale` of it. */
function mark(size, scale) {
  const unit = (size * scale) / 20;
  const offset = (size - 20 * unit) / 2;
  const bar = (x, y, w, opacity) =>
    `<rect x="${offset + x * unit}" y="${offset + y * unit}" width="${w * unit}" height="${4.5 * unit}" rx="${2.25 * unit}" fill="#fff" fill-opacity="${opacity}"/>`;
  return bar(6, 2, 8, 1) + bar(4, 8, 12, 0.85) + bar(2, 14, 16, 0.7);
}

const icons = [
  // Regular icon: rounded tile, transparent corners.
  { file: 'icon-192.png', size: 192, radius: 0.22, scale: 0.6 },
  { file: 'icon-512.png', size: 512, radius: 0.22, scale: 0.6 },
  // Maskable: full bleed, the mark inside the 80 % safe zone.
  { file: 'icon-maskable-512.png', size: 512, radius: 0, scale: 0.5 },
  // Apple applies its own mask: full square.
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 0.58 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, radius, scale } of icons) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * radius}" fill="${BRAND}"/>${mark(size, scale)}</svg>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: `${OUT}/${file}`, omitBackground: true });
  console.log(`${OUT}/${file}`);
}
await browser.close();
