// Opens both sites in headless Chrome: they must load cleanly, play sound and draw the hands.
// node scripts/smoke.mjs                 check this checkout
// node scripts/smoke.mjs <baseline-dir>  also require the hands to look the same as in another checkout
// SMOKE_SHOTS=<dir> saves the hand images for inspection.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { URL } from 'node:url';
import { chromium } from 'playwright-core';

const PAGES = ['index.html', 'hindustani/index.html'];
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.png': 'image/png',
};
const LOAD_TIMEOUT_MS = 30000;
const SETTLE_MS = 1500;
const LISTEN_MS = 3000;
const MIN_PEAK = 0.05;
const PIXEL_TOLERANCE = 32;
const MAX_CHANGED_SHARE = 0.01;

// Runs in the page before its own scripts: records policy violations and taps the audio output.
function instrumentPage() {
  window.__violations = [];
  document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode && !window.__analyser) {
      window.__analyser = this.context.createAnalyser();
      connect.call(this, window.__analyser);
    }
    return connect.call(this, target, ...rest);
  };
}

async function measurePeak(listenMs) {
  const samples = new Float32Array(2048);
  let peak = 0;
  const end = performance.now() + listenMs;
  while (performance.now() < end) {
    window.__analyser?.getFloatTimeDomainData(samples);
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
    await new Promise(r => setTimeout(r, 20));
  }
  return peak;
}

async function changedShare([a, b, tolerance]) {
  const load = src => new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = `data:image/png;base64,${src}`;
  });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return 1;
  const pixels = img => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  const pa = pixels(ia), pb = pixels(ib);
  let changed = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.abs(pa[i] - pb[i]) > tolerance || Math.abs(pa[i + 1] - pb[i + 1]) > tolerance
      || Math.abs(pa[i + 2] - pb[i + 2]) > tolerance) changed++;
  }
  return changed / (pa.length / 4);
}

function serve(root) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    const file = resolve(join(base, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function checkPage(browser, origin, path, label, problems) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  // Failed requests are reported by URL below, so the browser's generic message for them is skipped.
  const ignorable = url => url.endsWith('/favicon.ico');
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(`${path}: console: ${m.text()}`);
  });
  page.on('response', r => { if (r.status() >= 400 && !ignorable(r.url())) problems.push(`${path}: HTTP ${r.status()} for ${r.url()}`); });
  page.on('pageerror', e => problems.push(`${path}: ${e.message}`));
  page.on('requestfailed', r => { if (!ignorable(r.url())) problems.push(`${path}: failed to load ${r.url()}`); });
  await page.addInitScript(instrumentPage);
  await page.goto(`${origin}/${path}`);
  try {
    await page.waitForSelector('#tala-list li', { timeout: LOAD_TIMEOUT_MS });
    await page.waitForSelector('#btn-start:not([disabled])', { timeout: LOAD_TIMEOUT_MS });
  } catch {
    problems.push(`${path}: the page did not finish loading`);
    await page.close();
    return null;
  }
  await page.waitForTimeout(SETTLE_MS);
  const hands = await page.locator('#scene').screenshot();

  await page.click('#btn-start');
  const peak = await page.evaluate(measurePeak, LISTEN_MS);
  if (peak < MIN_PEAK) problems.push(`${path}: no sound after Start (peak ${peak.toFixed(3)})`);
  await page.click('#btn-start');

  const violations = await page.evaluate(() => window.__violations);
  violations.forEach(v => problems.push(`${path}: blocked by policy: ${v}`));
  await page.close();
  if (process.env.SMOKE_SHOTS) {
    await mkdir(process.env.SMOKE_SHOTS, { recursive: true });
    await writeFile(join(process.env.SMOKE_SHOTS, `${label}-${path.replace(/\W/g, '-')}.png`), hands);
  }
  return hands.toString('base64');
}

async function run(root, label, browser, problems) {
  const server = await serve(root);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const shots = {};
  for (const path of PAGES) shots[path] = await checkPage(browser, origin, path, label, problems);
  server.close();
  return shots;
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const problems = [];
const current = await run('.', 'current', browser, problems);

const baselineRoot = process.argv[2];
if (baselineRoot) {
  const baselineProblems = [];
  const baseline = await run(baselineRoot, 'baseline', browser, baselineProblems);
  const page = await browser.newPage();
  for (const path of PAGES) {
    if (!current[path] || !baseline[path]) continue;
    const share = await page.evaluate(changedShare, [baseline[path], current[path], PIXEL_TOLERANCE]);
    console.log(`${path}: ${(share * 100).toFixed(2)}% of the hands image changed`);
    if (share > MAX_CHANGED_SHARE) problems.push(`${path}: hands look different from the baseline (${(share * 100).toFixed(2)}% changed)`);
  }
}
await browser.close();

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Smoke test passed.');
