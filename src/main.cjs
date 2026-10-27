const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readFile, writeFile, mkdir } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');

const execFileAsync = promisify(execFile);
if (app?.commandLine && process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}
const COMMAND_TIMEOUT = 7000;
const DEFAULT_SETTINGS = {
  autoScan: true,
  aiEnabled: true,
  sendDiagnostics: false,
  notifications: true
};

let mainWindow;

function readOsRelease() {
  try {
    const content = require('node:fs').readFileSync('/etc/os-release', 'utf8');
    return Object.fromEntries(content.split('\n').filter(Boolean).map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')];
    }));
  } catch {
    return { ID: 'linux', PRETTY_NAME: 'Linux' };
  }
}

async function runCommand(command, args = [], timeout = COMMAND_TIMEOUT) {
  const allowed = new Set(['lspci', 'lsusb', 'lsmod', 'modinfo', 'rfkill', 'dpkg-query', 'apt-cache', 'uname']);
  if (!allowed.has(command)) throw new Error(`Команда запрещена: ${command}`);
  const candidates = [`/usr/bin/${command}`, `/usr/sbin/${command}`, `/bin/${command}`, `/sbin/${command}`];
  const executable = candidates.find(existsSync);
  if (!executable) throw Object.assign(new Error(`Команда ${command} не установлена`), { code: 'COMMAND_NOT_FOUND' });
  try {
    const result = await execFileAsync(executable, args, {
      timeout,
      maxBuffer: 1024 * 1024 * 2,
      shell: false,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
    });
    return result.stdout || '';
  } catch (error) {
    const wrapped = new Error(error.killed ? `Превышено время выполнения ${command}` : (error.stderr || error.message));
    wrapped.code = error.code;
    throw wrapped;
  }
}

function categoryFromText(text) {
  const value = text.toLowerCase();
  if (/vga|3d controller|display/.test(value)) return ['graphics', '▣'];
  if (/network|ethernet|wireless|wi-fi/.test(value)) return ['network', '◉'];
  if (/audio|multimedia/.test(value)) return ['audio', '◖'];
  if (/bluetooth/.test(value)) return ['bluetooth', 'ᛒ'];
  if (/usb|keyboard|mouse|touchpad|input/.test(value)) return ['input', '⌨'];
  if (/storage|sata|nvme|raid/.test(value)) return ['storage', '▤'];
  return ['other', '◈'];
}

function driverPackageFor(device, osId = 'linux') {
  const text = `${device.name} ${device.driver || ''}`.toLowerCase();
  if (text.includes('nvidia') && text.includes('nouveau')) return { name: 'nvidia-driver', reason: 'Доступен проприетарный драйвер NVIDIA' };
  if (text.includes('intel') && /wireless|wi-fi/.test(text)) return { name: 'firmware-iwlwifi', reason: 'Пакет прошивок Intel Wi‑Fi' };
  if (device.category === 'bluetooth' && !device.driver) return { name: 'bluez', reason: 'Стек Bluetooth для Linux' };
  if (device.source === 'PCI' && !device.driver) {
    const pkg = (osId === 'astra' || osId === 'debian') ? 'firmware-linux-nonfree' : 'linux-firmware';
    return { name: pkg, reason: 'Базовый пакет прошивок ядра Linux' };
  }
  return null;
}

function parseLspci(output, osId = 'linux') {
  const devices = [];
  const blocks = output.split(/\n(?=[0-9a-f]{4}:)/i).filter(Boolean);
  for (const block of blocks) {
    const first = block.split('\n')[0];
    const match = first.match(/^([0-9a-f:.]+)\s+([^:]+):\s*(.+?)(?:\s+\[[^\]]+\])?(?:\s+\(rev\s+[0-9a-f]+\))?$/i);
    if (!match) continue;
    const [category, icon] = categoryFromText(`${match[2]} ${match[3]}`);
    const driverMatch = block.match(/Kernel driver in use:\s*([^\n]+)/i);
    const moduleMatch = block.match(/Kernel modules:\s*([^\n]+)/i);
    const name = match[3].trim();
    const isBridge = /bridge|host bridge|dram controller/i.test(match[2]) || /\[06[0-9a-f]{2}\]/i.test(match[2]);
    const driver = driverMatch?.[1]?.trim() || null;
    const device = {
      id: `pci-${match[1]}`,
      name,
      category,
      icon,
      detail: match[2].trim(),
      driver,
      availableModule: moduleMatch?.[1]?.split(',')[0]?.trim() || null,
      version: os.release(),
      source: 'PCI',
      status: (driver || isBridge) ? 'ok' : 'problem',
      statusText: driver ? 'Работает корректно' : isBridge ? 'Системный мост (драйвер ядра)' : 'Драйвер не загружен'
    };
    device.recommendation = isBridge ? null : driverPackageFor(device, osId);
    devices.push(device);
  }
  return devices;
}

function parseUsbTree(treeOutput) {
  const driverMap = new Map();
  let currentBus = null;
  for (const line of treeOutput.split('\n')) {
    const busMatch = line.match(/Bus\s+(\d+)/);
    if (busMatch) currentBus = parseInt(busMatch[1], 10);
    const devMatch = line.match(/Dev\s+(\d+).*?Driver=([^,\s]+)/);
    if (devMatch && currentBus !== null) {
      const devNum = parseInt(devMatch[1], 10);
      const key = `${currentBus}:${devNum}`;
      const rawDriver = devMatch[2].replace(/\/\d+p$/, '');
      if (driverMap.has(key)) {
        const existing = driverMap.get(key);
        if (!existing.split(', ').includes(rawDriver)) {
          driverMap.set(key, `${existing}, ${rawDriver}`);
        }
      } else {
        driverMap.set(key, rawDriver);
      }
    }
  }
  return driverMap;
}

function parseLsusb(output, treeOutput = '', osId = 'linux') {
  const driverMap = treeOutput ? parseUsbTree(treeOutput) : new Map();
  return output.split('\n').filter(Boolean).map((line, index) => {
    const match = line.match(/^Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-f:]+)\s+(.+)$/i);
    if (!match) return null;
    const bus = parseInt(match[1], 10);
    const dev = parseInt(match[2], 10);
    const driver = driverMap.get(`${bus}:${dev}`) || null;
    const [category, icon] = categoryFromText(match[4]);
    const name = match[4].trim();
    const isHub = /root hub|hub/i.test(name);
    const isInput = category === 'input' || /keyboard|mouse|touchpad/i.test(name);
    const device = {
      id: `usb-${match[3]}-${match[1]}-${match[2]}`,
      name,
      category: isHub ? 'other' : (category === 'other' ? 'input' : category),
      icon: isHub ? '◈' : (icon === '◈' ? '⌁' : icon),
      detail: `USB ${match[3]}`,
      driver,
      version: os.release(),
      source: 'USB',
      status: 'ok',
      statusText: driver ? `Работает (${driver})` : (isHub || isInput) ? 'Работает корректно' : 'Устройство обнаружено',
      recommendation: null,
      index
    };
    device.recommendation = (isHub || isInput) ? null : driverPackageFor(device, osId);
    return device;
  }).filter(Boolean);
}

function demoDevices() {
  return [
    { id: 'demo-gpu', name: 'Графический адаптер', detail: 'PCI-видеокарта', category: 'graphics', icon: '▣', driver: 'не определён', version: os.release(), source: 'Демо', status: 'recommended', statusText: 'Требуется проверка', recommendation: { name: 'linux-firmware', reason: 'Проверьте доступный драйвер в репозитории' } },
    { id: 'demo-network', name: 'Сетевой адаптер', detail: 'Ethernet / Wi‑Fi', category: 'network', icon: '◉', driver: 'не определён', version: os.release(), source: 'Демо', status: 'unknown', statusText: 'Ожидает сканирования', recommendation: null },
    { id: 'demo-audio', name: 'Аудиоустройство', detail: 'Звуковая карта', category: 'audio', icon: '◖', driver: 'snd_hda_intel', version: os.release(), source: 'Демо', status: 'ok', statusText: 'Работает корректно', recommendation: null }
  ];
}

async function scanDevices() {
  const release = readOsRelease();
  const osId = release.ID || 'linux';
  const results = [];
  let realSource = false;
  try {
    results.push(...parseLspci(await runCommand('lspci', ['-D', '-nnk']), osId));
    realSource = true;
  } catch { /* optional system utility */ }
  try {
    let treeOutput = '';
    try { treeOutput = await runCommand('lsusb', ['-t']); } catch { /* lsusb -t optional */ }
    results.push(...parseLsusb(await runCommand('lsusb'), treeOutput, osId));
    realSource = true;
  } catch { /* optional system utility */ }
  if (!results.length) return { devices: demoDevices(), demo: true, note: 'Утилиты pciutils/usbutils не найдены. Показан безопасный демонстрационный набор.' };
  return { devices: results, demo: !realSource, note: null };
}

async function systemInfo() {
  const release = readOsRelease();
  let kernel = os.release();
  try { kernel = (await runCommand('uname', ['-r'])).trim(); } catch { /* use node value */ }
  const commands = ['lspci', 'lsusb', 'lsmod', 'modinfo', 'rfkill', 'apt-cache', 'pkexec'].map((name) => ({ name, available: [`/usr/bin/${name}`, `/usr/sbin/${name}`, `/bin/${name}`, `/sbin/${name}`].some(existsSync) }));
  return {
    distribution: release.PRETTY_NAME || release.NAME || 'Linux',
    id: release.ID || 'linux',
    kernel,
    architecture: process.arch,
    hostname: os.hostname(),
    commands,
    qwenConfigured: Boolean(process.env.QWEN_API_KEY),
    qwenModel: process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free'
  };
}

function diagnosticsFor(devices, info) {
  const issues = [];
  const missing = info.commands.filter((command) => !command.available && ['lspci', 'lsusb'].includes(command.name));
  if (missing.length) issues.push({ id: 'missing-tools', severity: 'warning', title: 'Не установлены утилиты обнаружения', description: `Для полного сканирования установите: ${missing.map((item) => item.name === 'lspci' ? 'pciutils' : 'usbutils').join(', ')}.`, action: 'Установить системные утилиты', risk: 'low' });
  devices.filter((device) => device.status === 'problem').forEach((device) => issues.push({ id: `device-${device.id}`, severity: 'critical', title: `${device.name}: драйвер не загружен`, description: 'Ядро обнаружило устройство, но активный модуль не найден.', action: device.recommendation ? `Проверить пакет ${device.recommendation.name}` : 'Проверить модуль ядра', risk: 'medium' }));
  if (!issues.length) issues.push({ id: 'system-ok', severity: 'success', title: 'Критических проблем не обнаружено', description: 'Основные проверки устройств и окружения завершены успешно.', action: 'Ничего делать не нужно', risk: 'low' });
  return issues;
}

function diagnosticContext(devices, info, issues) {
  return { schema_version: '1.0', system: { distribution: info.distribution, kernel: info.kernel, architecture: info.architecture }, devices: devices.map(({ id, name, category, driver, status, statusText, recommendation }) => ({ id, name, category, driver, status, statusText, recommendation })), issues: issues.map(({ title, description, severity }) => ({ title, description, severity })), user_intent: 'Объяснить проблемы драйверов и предложить безопасные действия' };
}

function postJson(urlString, body, timeout) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    if (url.protocol !== 'https:') {
      reject(new Error('Qwen API должен использовать HTTPS'));
      return;
    }
    const payload = JSON.stringify(body);
    const request = https.request({ hostname: url.hostname, port: url.port || 443, path: `${url.pathname.replace(/\/$/, '')}/chat/completions`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${process.env.QWEN_API_KEY}` }, timeout }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { data += chunk; if (data.length > 1024 * 1024) request.destroy(new Error('Ответ слишком большой')); });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`AI API: HTTP ${response.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(data)); } catch { reject(new Error('AI API вернул некорректный JSON')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Превышено время ожидания AI')));
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function askQwen(context) {
  if (!process.env.QWEN_API_KEY || process.env.QWEN_ENABLED === 'false') return null;
  const base = process.env.QWEN_BASE_URL || 'https://api.xkiro.com/v1';
  const system = 'Ты — диагностический помощник DriverHub для Linux. Анализируй только факты JSON. Не выполняй команды. Не предлагай отключать защиту системы или неподписанные источники. Верни краткий ответ на русском языке с полями summary, recommendations и confidence в JSON.';
  const response = await postJson(base, { model: process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free', temperature: 0.1, max_tokens: 900, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(context) }] }, Number(process.env.QWEN_TIMEOUT_MS || 15000));
  const content = response.choices?.[0]?.message?.content || '';
  try { return { ...JSON.parse(content.replace(/^```json\s*|\s*```$/g, '')), source: 'Qwen AI' }; } catch { return { summary: content.slice(0, 1000), recommendations: [], confidence: 0.5, source: 'Qwen AI' }; }
}

async function logEntry(entry) {
  const file = path.join(app.getPath('userData'), 'operations.json');
  await mkdir(path.dirname(file), { recursive: true });
  let entries = [];
  try { entries = JSON.parse(await readFile(file, 'utf8')); } catch { /* first run */ }
  entries.unshift({ id: Date.now().toString(36), timestamp: new Date().toISOString(), ...entry });
  await writeFile(file, JSON.stringify(entries.slice(0, 100), null, 2));
}

function validateIpcSender(event) {
  if (mainWindow && event?.sender !== mainWindow.webContents) {
    throw new Error('Доступ запрещён: неавторизованный отправитель IPC');
  }
}

async function readSavedSettings() {
  const file = path.join(app.getPath('userData'), 'settings.json');
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    const result = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof parsed[key] === typeof DEFAULT_SETTINGS[key]) {
        result[key] = parsed[key];
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeSavedSettings(settings) {
  const file = path.join(app.getPath('userData'), 'settings.json');
  await mkdir(path.dirname(file), { recursive: true });
  const current = await readSavedSettings();
  if (typeof settings === 'object' && settings !== null) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof settings[key] === typeof DEFAULT_SETTINGS[key]) {
        current[key] = settings[key];
      }
    }
  }
  await writeFile(file, JSON.stringify(current, null, 2));
  return current;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    backgroundColor: '#121a21',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      if (parsedUrl.protocol !== 'file:') {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('system:info', systemInfo);
ipcMain.handle('system:open-terminal', async () => { await shell.openPath('/usr/bin/x-terminal-emulator'); return true; });
ipcMain.handle('devices:scan', async () => { const result = await scanDevices(); await logEntry({ type: 'scan', status: 'success', summary: `Обнаружено устройств: ${result.devices.length}` }); return result; });
ipcMain.handle('diagnostics:run', async (_event, options = {}) => {
  const info = await systemInfo();
  const scan = await scanDevices();
  const issues = diagnosticsFor(scan.devices, info);
  let ai = null;
  if (options.useAI !== false && process.env.QWEN_ENABLED !== 'false') {
    try { ai = await askQwen(diagnosticContext(scan.devices, info, issues)); } catch (error) { ai = { error: error.message, source: 'Локальная диагностика' }; }
  }
  await logEntry({ type: 'diagnostics', status: issues.some((issue) => issue.severity === 'critical') ? 'warning' : 'success', summary: `Проверок: ${issues.length}`, ai: Boolean(ai && !ai.error) });
  return { info, devices: scan.devices, issues, ai, demo: scan.demo };
});
ipcMain.handle('drivers:install', async (event, payload = {}) => {
  validateIpcSender(event);
  const allowedPackages = new Set([
    'nvidia-driver', 'firmware-iwlwifi', 'bluez', 'linux-firmware',
    'pciutils', 'usbutils', 'firmware-linux-free', 'firmware-linux-nonfree', 'firmware-misc-nonfree'
  ]);
  const packageName = String(payload.packageName || '');
  if (!allowedPackages.has(packageName)) throw new Error('Пакет отсутствует в безопасном списке DriverHub');
  if (!existsSync('/usr/bin/pkexec')) throw new Error('Polkit (pkexec) не найден. Выполните установку вручную через пакетный менеджер.');
  await logEntry({ type: 'install', status: 'started', summary: packageName });
  try {
    const aptArgs = [
      '/usr/bin/apt-get',
      'install',
      '-y',
      '--no-install-recommends',
      '-o', 'Dpkg::Options::=--force-confdef',
      '-o', 'Dpkg::Options::=--force-confold',
      '-o', 'DPkg::Lock::Timeout=60',
      packageName
    ];
    await execFileAsync('/usr/bin/pkexec', aptArgs, {
      timeout: 300000,
      shell: false,
      maxBuffer: 1024 * 1024 * 4,
      env: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        DEBIAN_FRONTEND: 'noninteractive',
        LC_ALL: 'C',
        LANG: 'C'
      }
    });
    await logEntry({ type: 'install', status: 'success', summary: packageName });
    return { success: true, rebootRequired: /nvidia|firmware|linux/.test(packageName) };
  } catch (error) {
    await logEntry({ type: 'install', status: 'error', summary: `${packageName}: ${error.message.slice(0, 180)}` });
    if (error.code === 126 || error.code === 127) {
      throw new Error('Установка отменена пользователем (запрос прав отклонён)');
    }
    throw new Error(`Установка не выполнена: ${error.stderr || error.message}`);
  }
});
ipcMain.handle('logs:list', async () => { try { return JSON.parse(await readFile(path.join(app.getPath('userData'), 'operations.json'), 'utf8')); } catch { return []; } });
ipcMain.handle('logs:clear', async (event) => { validateIpcSender(event); await writeFile(path.join(app.getPath('userData'), 'operations.json'), '[]'); return true; });
ipcMain.handle('settings:get', async (event) => {
  validateIpcSender(event);
  const settings = await readSavedSettings();
  return { ...settings, aiConfigured: Boolean(process.env.QWEN_API_KEY), model: process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free' };
});
ipcMain.handle('settings:save', async (event, settings = {}) => {
  validateIpcSender(event);
  const saved = await writeSavedSettings(settings);
  return { ...saved, aiConfigured: Boolean(process.env.QWEN_API_KEY), model: process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free' };
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window:close', () => mainWindow?.close());

app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
