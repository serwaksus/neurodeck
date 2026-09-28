#!/usr/bin/env node
// Волна 3 (2026-09-28): генерация иконок PWA из SVG через Playwright (headless chromium).
// Запуск: node tools/make-icons.cjs (нужен установленный chromium: npx playwright install chromium)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ICON_SVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0f"/>
  <rect x="36" y="36" width="440" height="440" rx="72" fill="none" stroke="#d4af37" stroke-width="14"/>
  <rect x="40" y="40" width="432" height="432" rx="68" fill="none" stroke="#c73e4d" stroke-width="4" opacity="0.55"/>
  <!-- карта -->
  <rect x="146" y="106" width="220" height="300" rx="22" fill="#171420" stroke="#d4a574" stroke-width="10"/>
  <rect x="170" y="130" width="172" height="252" rx="12" fill="none" stroke="#6b5836" stroke-width="4" opacity="0.7"/>
  <!-- башня на карте -->
  <rect x="216" y="238" width="80" height="108" fill="#d4a574"/>
  <rect x="228" y="206" width="56" height="40" fill="#d4a574"/>
  <polygon points="256,150 296,206 216,206" fill="#d4a574"/>
  <rect x="244" y="262" width="24" height="36" rx="10" fill="#0a0a0f"/>
  <rect x="196" y="346" width="120" height="10" fill="#c73e4d"/>
  <rect x="196" y="362" width="120" height="10" fill="#c73e4d" opacity="0.6"/>
  <!-- искра -->
  <circle cx="256" cy="106" r="10" fill="#f4c896"/>
</svg>`;

(async () => {
  const root = path.join(__dirname, '..');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(ICON_SVG(size));
    const out = path.join(root, 'img', `icon-${size}.png`);
    await page.locator('svg').screenshot({ path: out });
    page.close();
    console.log('written', out, fs.statSync(out).size, 'bytes');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
