const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Electron security boundary is present', () => {
  const main = read('src/main.cjs');
  const preload = read('src/preload.cjs');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /execFile|child_process|shell\.openExternal/);
});

test('interface includes all DriverHub sections from the design', () => {
  const app = read('src/renderer/app.js');
  for (const label of ['Главная', 'Поиск драйверов', 'Установка', 'Исправление ошибок', 'Журнал', 'Настройки']) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /Обнаруженные устройства/);
  assert.match(app, /Qwen AI/);
});

test('driver installation is restricted to a package allowlist', () => {
  const main = read('src/main.cjs');
  assert.match(main, /allowedPackages/);
  assert.match(main, /pkexec/);
  assert.match(main, /no-install-recommends/);
  assert.doesNotMatch(main, /execFileAsync\([^,]+,\s*\[[^\]]*payload\.(command|shell)/);
});

test('renderer defines a strict Content Security Policy', () => {
  const html = read('src/renderer/index.html');
  assert.match(html, /http-equiv="Content-Security-Policy"/i);
  assert.match(html, /default-src 'self'/);
});

test('main process configures linux sandbox compatibility and safe hardware scanning', () => {
  const main = read('src/main.cjs');
  assert.match(main, /appendSwitch\('no-sandbox'\)/);
  assert.match(main, /sandbox:\s*true/);
  assert.doesNotMatch(main, /runCommand\('lsusb',\s*\['-nn'\]\)/);
  assert.match(main, /isBridge/);
});

test('pkexec execution uses noninteractive APT options, lock timeout, and isolated env', () => {
  const main = read('src/main.cjs');
  assert.match(main, /--force-confdef/);
  assert.match(main, /--force-confold/);
  assert.match(main, /Lock::Timeout=60/);
  assert.match(main, /timeout:\s*300000/);
  assert.match(main, /DEBIAN_FRONTEND/);
  assert.match(main, /error\.code === 126/);
});

