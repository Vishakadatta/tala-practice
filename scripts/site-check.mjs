// Checks the public site for tampering risks that no general scanner knows about.
// npm run check            report problems, exit 1 if any
// npm run check -- --fix   rewrite the CSP and import map after upgrading Three.js
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const PAGES = ['index.html', 'hindustani/index.html'];
const SOURCE_DIRS = ['css', 'js', 'hindustani/css', 'hindustani/js'];
const THREE_DIR = 'node_modules/three';
const THREE_ENTRIES = ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/controls/OrbitControls.js'];
const ALLOWED_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'github.com'];
const ALLOWED_LICENSES = ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'Python-2.0'];
const REQUIRED_NOTICES = ['LICENSE', 'SECURITY.md', 'assets/hands/LICENSE', 'hindustani/assets/tabla/LICENSE'];
const FORBIDDEN_CODE = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /\beval\s*\(/, /new Function\b/, /document\.write/];
const FORBIDDEN_HTML = [/\son[a-z]+\s*=/i, /\sstyle\s*=/i, /<script(?![^>]*\b(src=|type="importmap"))/i];

const fix = process.argv.includes('--fix');
const problems = [];

const hash = (algorithm, data) => `${algorithm}-${createHash(algorithm).update(data).digest('base64')}`;
const read = file => readFileSync(file, 'utf8');

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

// Follows relative imports so a Three.js release that splits its files stays fully covered.
function threeFiles() {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const path = join(THREE_DIR, file);
    for (const [, target] of read(path).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      visit(relative(THREE_DIR, join(dirname(path), target)));
    }
  };
  THREE_ENTRIES.forEach(visit);
  return [...seen].sort();
}

function expectedHead() {
  const { version } = JSON.parse(read(join(THREE_DIR, 'package.json')));
  const base = `https://cdn.jsdelivr.net/npm/three@${version}/`;
  const integrity = Object.fromEntries(threeFiles().map(file => [base + file, hash('sha384', readFileSync(join(THREE_DIR, file)))]));
  const map = { imports: { three: `${base}build/three.module.js`, 'three/addons/': `${base}examples/jsm/` }, integrity };
  const importMap = `\n${JSON.stringify(map, null, 2).replace(/^/gm, '  ')}\n  `;
  const csp = [
    "default-src 'none'",
    `script-src 'self' ${hash('sha256', importMap).replace(/^(.*)$/, "'$1'")} ${base}`,
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return { importMap, csp };
}

function checkPages() {
  const { importMap, csp } = expectedHead();
  for (const page of PAGES) {
    const html = read(page);
    const next = html
      .replace(/(<script type="importmap">)[\s\S]*?(<\/script>)/, (_, open, close) => open + importMap + close)
      .replace(/(http-equiv="Content-Security-Policy" content=")[^"]*(")/, (_, open, close) => open + csp + close);
    if (next === html) continue;
    if (fix) writeFileSync(page, next);
    else problems.push(`${page}: CSP or import map is out of date; run npm run check -- --fix`);
  }
}

function checkSources() {
  const files = [...PAGES, ...SOURCE_DIRS.flatMap(listFiles)];
  const versions = new Set();
  for (const file of files) {
    const text = read(file);
    for (const [url, host] of text.matchAll(/\b(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      if (!ALLOWED_HOSTS.includes(host)) problems.push(`${file}: unexpected host in ${url}`);
      if (url.startsWith('http:')) problems.push(`${file}: insecure URL ${url}`);
    }
    for (const [, version] of text.matchAll(/\.(?:js|css)\?v=(\d+)/g)) versions.add(version);
    if (file.endsWith('.js')) {
      for (const pattern of FORBIDDEN_CODE) if (pattern.test(text)) problems.push(`${file}: forbidden ${pattern}`);
      for (const [imported] of text.matchAll(/from '\.[^']+\.js'/g)) problems.push(`${file}: unversioned ${imported}`);
    }
    if (file.endsWith('.html')) {
      for (const pattern of FORBIDDEN_HTML) if (pattern.test(text)) problems.push(`${file}: forbidden ${pattern}`);
    }
  }
  if (versions.size !== 1) problems.push(`?v= tags differ: ${[...versions].join(', ')}`);
}

function checkLicenses() {
  for (const file of REQUIRED_NOTICES) {
    if (!existsSync(file)) problems.push(`missing ${file}`);
  }
  const { packages } = JSON.parse(read('package-lock.json'));
  for (const [path, info] of Object.entries(packages)) {
    if (path && !ALLOWED_LICENSES.includes(info.license)) problems.push(`${path}: license ${info.license} needs review`);
  }
}

checkPages();
checkSources();
checkLicenses();

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(fix ? 'Updated. All checks pass.' : 'All checks pass.');
