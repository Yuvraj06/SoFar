// Makes the README screenshots: npm run screenshots
// It builds a small preview page, runs the real SoFar screens with a fake browser
// and mocked AI replies (a made-up show), and photographs them with your own Chrome.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer-core';
import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'node_modules/.cache/sofar-preview');
const imagesDir = path.join(root, 'docs/images');

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`);

await build({ root: here, configFile: false, logLevel: 'error', base: './', plugins: [react()], build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(here, 'preview.html') } } });

// Tiny static server for the built preview.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const file = path.join(outDir, new URL(req.url, 'http://x').pathname);
  try {
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/preview.html`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(scene, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(`${base}?scene=${scene}`);
  await page.waitForFunction(() => document.body.textContent.includes('lines seen') || document.querySelector('.settings'), { timeout: 15000 });
  return page;
}

// Types a question, presses Enter, waits until the answer is on screen.
async function ask(page, question) {
  const before = await page.$$eval('.bubble.assistant', (n) => n.length);
  await page.waitForFunction(() => document.querySelector('.chat-input textarea') !== null);
  await page.type('.chat-input textarea', question);
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('.bubble.assistant').length > n && !document.querySelector('.chat-stage'), { timeout: 20000 }, before);
  await sleep(250);
}

async function conversation(page, questions) {
  for (const q of questions) await ask(page, q);
}

const shot = async (page, name, opts = {}) => {
  await page.evaluate(() => document.activeElement?.blur()); // no focus ring in the pictures
  return page.screenshot({ path: path.join(imagesDir, name), ...opts });
};

// 1. Empty chat
{
  const page = await open('chat', 420, 760);
  await sleep(600);
  await shot(page, 'empty.png');
  await page.close();
}
// 2. The "checking for spoilers" moment
{
  const page = await open('chat', 420, 760);
  await page.type('.chat-input textarea', 'What has happened so far?');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.chat-stage')?.textContent.includes('Checking'), { timeout: 20000 });
  await shot(page, 'thinking.png');
  await page.close();
}
// 3. A full conversation, including a blocked spoiler
{
  const page = await open('chat', 420, 900);
  await conversation(page, ['What has happened so far?', 'Who is this person?', 'Does Mara escape in the end?']);
  await shot(page, 'chat.png');
  await page.close();
}
// 4. Settings page
{
  const page = await open('settings', 900, 980);
  const [testButton] = await page.$$('.cards .card button');
  await testButton.click();
  await page.waitForSelector('.status.ok', { timeout: 10000 });
  await shot(page, 'settings.png', { fullPage: true });
  await page.close();
}
// 5. Hero: a browser window with a made-up video and the real side panel
{
  const page = await open('hero', 1400, 860);
  await conversation(page, ['What has happened so far?', 'Who is this person?']);
  await shot(page, 'hero.png');
  await page.close();
}

// 6. Static graphics for the README (banner and diagram)
for (const [file, width, height, out] of [
  ['banner.html', 1280, 400, 'banner.png'],
  ['flow.html', 1500, 490, 'how-it-works.png'],
]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(root, 'scripts/graphics', file));
  await shot(page, out);
  await page.close();
}

await browser.close();
server.close();
console.log('Screenshots saved in docs/images');
