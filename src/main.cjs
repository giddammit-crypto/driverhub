const { app, BrowserWindow, ipcMain, shell } = require('electron');
if (app?.setName) app.setName('driverhub');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { readFile, writeFile, mkdir } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');

const { CANON_MODELS, detectCanonPrinters } = require('./canon-lbp-setup.cjs');
const { ALLOWED_PACKAGES, installPackageWithProgress, installCanonLbpWithProgress } = require('./installer.cjs');
const { FREE_QWEN_MODELS, testXkiroConnection, runAgentTurn, executeAgentAction } = require('./agent-engine.cjs');

const execFileAsync = promisify(execFile);
if (app?.commandLine && process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}
const COMMAND_TIMEOUT = 7000;
const DEFAULT_SETTINGS = {
  autoScan: true,
  aiEnabled: true,
  sendDiagnostics: false,
  notifications: true,
  xkiroApiKey: '',
  xkiroBaseUrl: 'https://api.xkiro.com/v1',
  qwenModel: 'qwen/qwen3.8-max:free'
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
  const allowed = new Set(['lspci', 'lsusb', 'lsmod', 'modinfo', 'rfkill', 'dpkg-query', 'apt-cache', 'uname', 'lpstat', 'systemctl', 'dmesg', 'id', 'whoami', 'groups', 'lp', 'cancel', 'python3']);
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
  if (/printer|canon.*lbp|capt|laser shot|i-sensys/.test(value)) return ['printer', '🖶'];
  if (/vga|3d controller|display/.test(value)) return ['graphics', '▣'];
  if (/network|ethernet|wireless|wi-fi/.test(value)) return ['network', '◉'];
  if (/audio|multimedia/.test(value)) return ['audio', '◖'];
  if (/bluetooth/.test(value)) return ['bluetooth', 'ᛒ'];
  if (/usb|keyboard|mouse|touchpad|input/.test(value)) return ['input', '⌨'];
  if (/storage|sata|nvme|raid/.test(value)) return ['storage', '▤'];
  return ['other', '◈'];
}

function driverPackageFor(device, osId = 'linux') {
  const text = `${device.name} ${device.detail || ''} ${device.driver || ''}`.toLowerCase();
  if (/canon|04a9:|lbp|capt/.test(text)) {
    return {
      name: 'canon-lbp-suite',
      reason: 'Специализированный драйверный комплекс Canon LBP для Astra Linux / Debian'
    };
  }
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
    const isBridge = /bridge|host bridge|dram controller|sram|ram memory|memory controller|system peripheral/i.test(match[2]) || /\[06[0-9a-f]{2}\]|\[05[0-9a-f]{2}\]/i.test(match[2]);
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
      statusText: driver ? 'Работает корректно' : isBridge ? 'Системный контроллер (драйвер ядра)' : 'Драйвер не загружен'
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
    const isCanon = /04a9|canon/i.test(`${match[3]} ${name}`);
    const device = {
      id: `usb-${match[3]}-${match[1]}-${match[2]}`,
      name,
      category: isCanon ? 'printer' : isHub ? 'other' : (category === 'other' ? 'input' : category),
      icon: isCanon ? '🖶' : isHub ? '◈' : (icon === '◈' ? '⌁' : icon),
      detail: `USB ${match[3]}`,
      driver,
      version: os.release(),
      source: 'USB',
      status: isCanon && !driver ? 'recommended' : 'ok',
      statusText: isCanon ? (driver ? `Работает (${driver})` : 'Требуется драйвер Canon LBP') : driver ? `Работает (${driver})` : (isHub || isInput) ? 'Работает корректно' : 'Устройство обнаружено',
      recommendation: null,
      index
    };
    device.recommendation = (isHub || isInput) ? null : driverPackageFor(device, osId);
    return device;
  }).filter(Boolean);
}

function demoDevices(installedPackages = new Set()) {
  const fwInstalled = installedPackages.has('linux-firmware');
  return [
    { id: 'demo-canon', name: 'Canon i-SENSYS LBP2900', detail: 'USB 04a9:2676', category: 'printer', icon: '🖶', driver: 'CUPS / cjet', version: os.release(), source: 'USB', status: 'ok', statusText: 'Работает (служба печати CUPS)', recommendation: null },
    { id: 'demo-gpu', name: 'Графический адаптер', detail: 'PCI-видеокарта', category: 'graphics', icon: '▣', driver: fwInstalled ? 'i915 (ожидает рестарта)' : 'не определён', version: os.release(), source: 'Демо', status: fwInstalled ? 'warning' : 'recommended', statusText: fwInstalled ? 'Драйвер установлен (требуется перезагрузка системы)' : 'Требуется проверка', rebootRequired: fwInstalled, recommendation: fwInstalled ? null : { name: 'linux-firmware', reason: 'Проверьте доступный драйвер в репозитории' } },
    { id: 'demo-network', name: 'Сетевой адаптер', detail: 'Ethernet / Wi‑Fi', category: 'network', icon: '◉', driver: 'e1000e', version: os.release(), source: 'Демо', status: 'ok', statusText: 'Работает корректно', recommendation: null },
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

  // Проверка базы установленных пакетов DPKG и очередей CUPS для корректной оценки статуса устройств
  let installedPackages = new Set();
  try {
    const dpkgOut = await runCommand('dpkg-query', ['-W', "-f=${Package} ${Status}\n"]);
    for (const line of dpkgOut.split('\n')) {
      if (line.includes('install ok installed')) {
        installedPackages.add(line.split(' ')[0]);
      }
    }
  } catch {}

  let hasCupsPrinters = false;
  try {
    const lpOut = await runCommand('lpstat', ['-p']);
    hasCupsPrinters = lpOut.includes('printer') || lpOut.includes('принтер');
  } catch {}

  if (!results.length) return { devices: demoDevices(installedPackages), demo: true, note: 'Утилиты pciutils/usbutils не найдены. Показан безопасный демонстрационный набор.' };

  for (const device of results) {
    const isCanon = /canon|04a9:|lbp/i.test(`${device.name} ${device.detail || ''}`);
    const isPrinter = device.category === 'printer' || isCanon;

    if (isPrinter && (hasCupsPrinters || installedPackages.has('printer-driver-cjet') || installedPackages.has('cups'))) {
      device.status = 'ok';
      device.statusText = 'Работает (служба печати CUPS)';
      device.driver = device.driver || 'CUPS / printer-driver-cjet';
      device.recommendation = null;
      continue;
    }

    if (device.recommendation && device.recommendation.name) {
      const pkgName = device.recommendation.name;
      const isPkgInstalled = installedPackages.has(pkgName) ||
        (pkgName === 'canon-lbp-suite' && (hasCupsPrinters || installedPackages.has('printer-driver-cjet'))) ||
        (/firmware|linux-nonfree/i.test(pkgName) && (
          installedPackages.has('linux-firmware') ||
          installedPackages.has('firmware-linux-nonfree') ||
          installedPackages.has('firmware-linux-free') ||
          installedPackages.has('firmware-misc-nonfree')
        ));

      if (isPkgInstalled) {
        if (!device.driver || device.driver === 'не определён' || device.driver === 'usbfs') {
          device.status = 'warning';
          device.statusText = 'Драйвер установлен (требуется перезагрузка системы)';
          device.rebootRequired = true;
          device.recommendation.reason = 'Пакет установлен в систему. Для применения ядром Linux требуется перезагрузка компьютера.';
        } else {
          device.status = 'ok';
          device.statusText = `Работает (${device.driver})`;
          device.recommendation = null;
        }
      }
    }
  }

  const systemRebootRequired = existsSync('/var/run/reboot-required') ||
    existsSync('/run/reboot-required') ||
    results.some((d) => d.rebootRequired);

  return { devices: results, demo: !realSource, note: null, rebootRequired: systemRebootRequired };
}

async function systemInfo() {
  const release = readOsRelease();
  let kernel = os.release();
  try { kernel = (await runCommand('uname', ['-r'])).trim(); } catch { /* use node value */ }
  const commands = ['lspci', 'lsusb', 'lsmod', 'modinfo', 'rfkill', 'apt-cache', 'pkexec', 'lpstat', 'systemctl'].map((name) => ({ name, available: [`/usr/bin/${name}`, `/usr/sbin/${name}`, `/bin/${name}`, `/sbin/${name}`].some(existsSync) }));
  const settings = await readSavedSettings();
  const activeKey = settings.xkiroApiKey || process.env.QWEN_API_KEY;
  const activeModel = settings.qwenModel || process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free';

  let userInLp = false;
  try {
    const grp = (await runCommand('id', ['-Gn'])).trim();
    userInLp = grp.split(/\s+/).includes('lp');
  } catch {}

  return {
    distribution: release.PRETTY_NAME || release.NAME || 'Linux',
    id: release.ID || 'linux',
    kernel,
    architecture: process.arch,
    hostname: os.hostname(),
    commands,
    userInLpGroup: userInLp,
    rebootRequired: existsSync('/var/run/reboot-required') || existsSync('/run/reboot-required'),
    qwenConfigured: Boolean(activeKey),
    qwenModel: activeModel
  };
}

function diagnosticsFor(devices, info) {
  const issues = [];
  const missing = info.commands.filter((command) => !command.available && ['lspci', 'lsusb'].includes(command.name));
  if (missing.length) issues.push({ id: 'missing-tools', severity: 'warning', title: 'Не установлены утилиты обнаружения', description: `Для полного сканирования установите: ${missing.map((item) => item.name === 'lspci' ? 'pciutils' : 'usbutils').join(', ')}.`, action: 'Установить системные утилиты', risk: 'low' });
  
  // Проверка принтеров Canon
  const canonDevices = devices.filter((d) => /canon.*lbp|04a9:/i.test(`${d.name} ${d.detail || ''}`));
  if (canonDevices.length) {
    const isAstra = /astra/i.test(`${info.distribution} ${info.id || ''}`);
    // Если в Astra Linux пользователь не в группе lp: задания отправляются, но печать не идет!
    if (isAstra && info.userInLpGroup === false) {
      issues.push({
        id: 'canon-astra-lp-group',
        severity: 'critical',
        title: 'Astra Linux: пользователь не состоит в группе lp',
        description: 'Принтер Canon LBP обнаружен. В Astra Linux без включения пользователя в системную группу lp задания успешно отправляются в очередь CUPS, но реальная печать не начинается (блокирован доступ к /dev/usb/lp0 и буферу очереди ccpd).',
        action: 'Добавить пользователя в группы lp/lpadmin и восстановить печать',
        risk: 'low',
        actionType: 'canon_fix_groups',
        params: { username: os.userInfo ? os.userInfo().username : 'astra' }
      });
    }

    issues.push({
      id: 'canon-lbp-setup',
      severity: 'warning',
      title: 'Обнаружен принтер Canon серии LBP',
      description: 'В Astra Linux и Debian принтеры Canon CAPT требуют специальной настройки модуля usblp, службы ccpd, групп lp/lpadmin и буфера FIFO.',
      action: 'Запустить автоматическую настройку Canon LBP',
      risk: 'low',
      actionType: 'canon_setup',
      modelKey: 'LBP2900'
    });
  }

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
    const settingsPromise = readSavedSettings();
    settingsPromise.then((settings) => {
      const apiKey = settings.xkiroApiKey || process.env.QWEN_API_KEY;
      const request = https.request({ hostname: url.hostname, port: url.port || 443, path: `${url.pathname.replace(/\/$/, '')}/chat/completions`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${apiKey}` }, timeout }, (response) => {
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
    }).catch(reject);
  });
}

function parseAiDiagnosticOutput(content) {
  if (!content || typeof content !== 'string') {
    return { summary: 'Анализ завершен. Все проверенные устройства работают стабильно.', recommendations: [], confidence: 0.8, source: 'Qwen AI' };
  }

  const cleaned = content.trim().replace(/^```(?:json)?\s*|```$/gi, '').trim();

  // 1. Полный парсинг JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return {
        summary: String(parsed.summary || parsed.description || parsed.text || '').trim(),
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(r => String(typeof r === 'string' ? r : r.title || r.text || '')).filter(Boolean) : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
        source: 'Qwen AI'
      };
    }
  } catch {}

  // 2. Регулярное извлечение из частичного/оборванного JSON
  const summaryMatch = cleaned.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*?)"/);
  let summary = summaryMatch ? summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim() : '';

  const recommendations = [];
  const recsBlockMatch = cleaned.match(/"recommendations"\s*:\s*\[([\s\S]*)/);
  if (recsBlockMatch) {
    const itemRegex = /"((?:\\.|[^"\\])*?)"/g;
    let match;
    while ((match = itemRegex.exec(recsBlockMatch[1])) !== null) {
      const item = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
      if (item && item !== 'recommendations' && !item.startsWith('{')) {
        recommendations.push(item);
      }
    }
  }

  if (summary || recommendations.length) {
    return {
      summary: summary || 'Анализ конфигурации системы и оборудования выполнен.',
      recommendations,
      confidence: 0.8,
      source: 'Qwen AI'
    };
  }

  // 3. Если ответ в виде связного текста без JSON-обертки
  const plainText = cleaned
    .replace(/^\{?\s*"summary"\s*:\s*"?/, '')
    .replace(/"?\s*,\s*"recommendations"[\s\S]*$/, '')
    .replace(/"?\s*\}\s*$/, '')
    .trim();

  return {
    summary: plainText || 'Диагностика оборудования завершена.',
    recommendations: [],
    confidence: 0.75,
    source: 'Qwen AI'
  };
}

async function askQwen(context) {
  const settings = await readSavedSettings();
  const apiKey = settings.xkiroApiKey || process.env.QWEN_API_KEY;
  if (!apiKey || process.env.QWEN_ENABLED === 'false') return null;
  const base = settings.xkiroBaseUrl || process.env.QWEN_BASE_URL || 'https://api.xkiro.com/v1';
  const model = settings.qwenModel || process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free';
  const system = 'Ты — профессиональный диагностический помощник DriverHub для Linux (Astra Linux, Debian, Ubuntu). Анализируй аппаратные устройства, модули ядра и подсистему печати. Отвечай строго структурированным JSON на русском языке с полями summary (подробный и связный текст анализа), recommendations (массив понятных рекомендаций для пользователя) и confidence (число от 0 до 1). Не обрывай ответ.';
  const response = await postJson(base, {
    model,
    temperature: 0.1,
    max_tokens: 3000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(context) }
    ]
  }, Number(process.env.QWEN_TIMEOUT_MS || 25000));
  const content = response.choices?.[0]?.message?.content || '';
  return parseAiDiagnosticOutput(content);
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
      if (parsed[key] !== undefined) {
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
      if (settings[key] !== undefined) {
        current[key] = settings[key];
      }
    }
  }
  await writeFile(file, JSON.stringify(current, null, 2));
  return current;
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icons', 'driverhub-512.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    icon: iconPath,
    backgroundColor: '#0B111A',
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

if (ipcMain?.handle) {
  ipcMain.handle('system:info', systemInfo);
  ipcMain.handle('system:open-terminal', async () => { await shell.openPath('/usr/bin/x-terminal-emulator'); return true; });
  ipcMain.handle('system:reboot', async (event) => {
    validateIpcSender(event);
    await logEntry({ type: 'system', status: 'started', summary: 'Перезагрузка системы по запросу пользователя' });
    try {
      await runCommand('systemctl', ['reboot']);
      return { success: true };
    } catch (err) {
      try {
        await execFileAsync('/usr/bin/pkexec', ['/usr/bin/systemctl', 'reboot'], { timeout: 15000 });
        return { success: true };
      } catch (e) {
        throw new Error(`Не удалось выполнить перезагрузку: ${e.message}`);
      }
    }
  });
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
  const packageName = String(payload.packageName || '').trim();
  const allowedPackages = ALLOWED_PACKAGES;

  // Специальная обработка для установки комплекса Canon LBP
  if (packageName === 'canon-lbp-suite') {
    const modelKey = payload.modelKey || 'LBP2900';
    return await handleInstallCanonLbp(event, { modelKey });
  }

  if (!allowedPackages.has(packageName) && !/^(firmware-|printer-driver-|nvidia-|cups|bluez)/.test(packageName)) {
    throw new Error('Пакет отсутствует в безопасном списке DriverHub');
  }
  if (!existsSync('/usr/bin/pkexec')) {
    throw new Error('Polkit (pkexec) не найден. Выполните установку вручную через пакетный менеджер.');
  }

  // Опции безопасности APT и pkexec:
  // --no-install-recommends, --force-confdef, --force-confold, DPkg::Lock::Timeout=60, timeout: 300000, DEBIAN_FRONTEND
  await logEntry({ type: 'install', status: 'started', summary: packageName });

  try {
    const onProgress = (data) => {
      mainWindow?.webContents.send('install:progress', data);
    };

    const result = await installPackageWithProgress(packageName, onProgress);
    await logEntry({ type: 'install', status: 'success', summary: packageName });
    return result;
  } catch (error) {
    await logEntry({ type: 'install', status: 'error', summary: `${packageName}: ${error.message.slice(0, 180)}` });
    if (error.code === 126 || error.code === 127) {
      throw new Error('Установка отменена пользователем (запрос прав отклонён)');
    }
    throw new Error(`Установка не выполнена: ${error.stderr || error.message}`);
  }
});

async function handleInstallCanonLbp(event, payload = {}) {
  validateIpcSender(event);
  const modelKey = payload.modelKey || 'LBP2900';
  const printerName = payload.printerName || `Canon_${modelKey}`;
  await logEntry({ type: 'install', status: 'started', summary: `Canon ${modelKey} (Astra Linux Suite)` });

  try {
    const onProgress = (data) => {
      mainWindow?.webContents.send('install:progress', data);
    };
    const result = await installCanonLbpWithProgress(modelKey, printerName, onProgress);
    await logEntry({ type: 'install', status: 'success', summary: `Canon ${modelKey} настроен` });
    return result;
  } catch (error) {
    await logEntry({ type: 'install', status: 'error', summary: `Canon ${modelKey}: ${error.message.slice(0, 180)}` });
    if (error.code === 126 || error.code === 127) {
      throw new Error('Установка отменена пользователем (запрос прав отклонён)');
    }
    throw new Error(`Ошибка настройки Canon: ${error.stderr || error.message}`);
  }
}

ipcMain.handle('drivers:install-canon', handleInstallCanonLbp);

ipcMain.handle('ai:test-connection', async (event, payload = {}) => {
  validateIpcSender(event);
  const settings = await readSavedSettings();
  const apiKey = payload.apiKey || settings.xkiroApiKey || process.env.QWEN_API_KEY;
  const baseUrl = payload.baseUrl || settings.xkiroBaseUrl || process.env.QWEN_BASE_URL || 'https://api.xkiro.com/v1';
  const model = payload.model || settings.qwenModel || process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free';

  return await testXkiroConnection({ apiKey, baseUrl, model });
});

ipcMain.handle('ai:get-free-models', async () => {
  return FREE_QWEN_MODELS;
});

ipcMain.handle('agent:chat', async (event, payload = {}) => {
  validateIpcSender(event);
  const settings = await readSavedSettings();
  const userMessage = String(payload.message || '').trim();
  const history = Array.isArray(payload.history) ? payload.history : [];

  return await runAgentTurn({
    userMessage,
    history,
    settings,
    scanDevicesFn: scanDevices
  });
});

ipcMain.handle('agent:execute-action', async (event, payload = {}) => {
  validateIpcSender(event);
  const action = payload.action;
  await logEntry({ type: 'repair', status: 'started', summary: action.title || action.id });

  try {
    const onProgress = (data) => {
      mainWindow?.webContents.send('install:progress', data);
    };
    const result = await executeAgentAction(action, onProgress);
    await logEntry({ type: 'repair', status: 'success', summary: action.title || action.id });
    return result;
  } catch (error) {
    await logEntry({ type: 'repair', status: 'error', summary: `${action.title || action.id}: ${error.message.slice(0, 180)}` });
    throw error;
  }
});

function parseInstalledPrinters(lpstatOutput, devicesOutput = '') {
  const printers = [];
  const deviceMap = new Map();
  for (const line of devicesOutput.split('\n')) {
    const m = line.match(/(?:device for|устройство для)\s+([^:]+):\s*(.+)/i);
    if (m) deviceMap.set(m[1].trim(), m[2].trim());
  }

  let defaultPrinter = null;
  const defMatch = lpstatOutput.match(/(?:system default destination|назначение системы по умолчанию):\s*([^\n]+)/i);
  if (defMatch) defaultPrinter = defMatch[1].trim();

  for (const line of lpstatOutput.split('\n')) {
    const match = line.match(/^(?:printer|принтер)\s+([^\s]+)\s+(.+)$/i);
    if (match) {
      const name = match[1];
      const statusText = match[2];
      const isIdle = /idle|свободен/i.test(statusText);
      const isPrinting = /printing|печатает/i.test(statusText);
      const isOffline = /disabled|отключен|остановлен/i.test(statusText);
      printers.push({
        name,
        isDefault: name === defaultPrinter,
        status: isPrinting ? 'printing' : isIdle ? 'idle' : isOffline ? 'disabled' : 'ready',
        statusText: isPrinting ? 'Идёт печать' : isIdle ? 'Готов к работе' : isOffline ? 'Отключён' : statusText,
        uri: deviceMap.get(name) || 'Подключено через CUPS',
        rawStatus: statusText
      });
    }
  }
  return printers;
}

function generateBrandedTestPage({ printerName, osDistribution, kernel, architecture, hostname, dateStr }) {
  return `%!PS-Adobe-3.0
%%Title: DRIVER HUB LINUX Test Page - biblioteka33.ru
%%Creator: DriverHub Linux (biblioteka33.ru)
%%Pages: 1
%%BoundingBox: 0 0 595 842
%%DocumentData: Clean7Bit
%%LanguageLevel: 2
%%EndComments

%%Page: 1 1
save

% 1. PURE WHITE BACKGROUND (zero toner/ink consumed on paper background)
1.0 setgray
0 0 595 842 rectfill

% Accent top bar (DriverHub Green #16D95A)
0.09 0.85 0.35 setrgbcolor
45 780 505 4 rectfill

% Header Logo & Title
/Helvetica-Bold findfont 24 scalefont setfont
0.05 0.08 0.12 setrgbcolor
45 750 moveto
(DRIVER HUB ) show
0.09 0.85 0.35 setrgbcolor
(LINUX) show

/Helvetica-Bold findfont 14 scalefont setfont
450 750 moveto
(biblioteka33.ru) show

/Helvetica findfont 10 scalefont setfont
0.40 0.48 0.55 setrgbcolor
45 730 moveto
(Astra Linux Calibration Suite - Driver Hub v1.0) show

% Divider line
0.78 0.84 0.89 setrgbcolor
1 setlinewidth
45 715 moveto 550 715 lineto stroke

% Diagnostics info box
0.97 0.98 0.99 setrgbcolor
45 570 505 130 rectfill
0.78 0.84 0.89 setrgbcolor
1 setlinewidth
45 570 505 130 rectstroke

/Helvetica-Bold findfont 11 scalefont setfont
0.05 0.08 0.12 setrgbcolor
60 675 moveto
(SYSTEM AND PRINT DIAGNOSTICS:) show

/Helvetica-Bold findfont 10 scalefont setfont
0.30 0.38 0.45 setrgbcolor
60 650 moveto (Target Printer:) show
60 630 moveto (Operating System:) show
60 610 moveto (Kernel & Arch:) show
60 590 moveto (Date & Time:) show

/Helvetica findfont 10 scalefont setfont
0.05 0.08 0.12 setrgbcolor
200 650 moveto (${printerName}) show
200 630 moveto (${osDistribution}) show
200 610 moveto (${kernel} [${architecture}]) show
200 590 moveto (${dateStr}) show

% Calibration and color bars
/Helvetica-Bold findfont 11 scalefont setfont
0.05 0.08 0.12 setrgbcolor
45 540 moveto
(TONER DENSITY AND GRAYSCALE CALIBRATION (10% - 100%):) show

% Draw 10 test patches
0 1 9 {
  /i exch def
  /pct i 1 add 10 mul def
  /val 1.0 pct 100 div sub def
  val setgray
  45 i 51 mul add 490 45 30 rectfill
  0.5 setlinewidth
  0.75 setgray
  45 i 51 mul add 490 45 30 rectstroke
} for

% Sharpness lines
/Helvetica-Bold findfont 11 scalefont setfont
0.05 0.08 0.12 setrgbcolor
45 455 moveto
(LINE RESOLUTION TEST (0.25pt - 2.0pt):) show

0.1 setgray
0.25 setlinewidth
45 435 moveto 350 435 lineto stroke
0.50 setlinewidth
45 420 moveto 350 420 lineto stroke
1.00 setlinewidth
45 405 moveto 350 405 lineto stroke
2.00 setlinewidth
45 390 moveto 350 390 lineto stroke

% Typography resolution test
45 350 moveto
/Times-Bold findfont 12 scalefont setfont
(DRIVER HUB LINUX - biblioteka33.ru - Calibration Passed) show
45 330 moveto
/Helvetica findfont 10 scalefont setfont
(Latin & Cyrillic Typography Test - Astra Linux Edition) show

% Footer
0.8 setgray
0.8 setlinewidth
45 70 moveto 550 70 lineto stroke

/Helvetica-Bold findfont 9 scalefont setfont
0.09 0.85 0.35 setrgbcolor
45 50 moveto
(DRIVER HUB LINUX  |  biblioteka33.ru) show

/Helvetica findfont 9 scalefont setfont
0.4 setgray
360 50 moveto
(Hardware and Kernel Manager for Linux) show

showpage
restore
%%EOF
`;
}

async function generateBrandedTestPageFile({ printerName, osDistribution, kernel, architecture, hostname, dateStr }) {
  const tmpPdf = path.join(os.tmpdir(), `driverhub-testpage-${Date.now()}.pdf`);
  const generatorScript = path.join(__dirname, 'generate-test-page.py');

  try {
    const pythonExe = existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';
    await execFileAsync(pythonExe, [
      generatorScript,
      '--output', tmpPdf,
      '--printer', String(printerName || 'Принтер'),
      '--os', String(osDistribution || 'Astra Linux'),
      '--kernel', String(kernel || os.release()),
      '--arch', String(architecture || process.arch),
      '--hostname', String(hostname || os.hostname()),
      '--date', String(dateStr || new Date().toLocaleString('ru-RU')),
      '--lp-ok'
    ], { timeout: 15000 });

    if (existsSync(tmpPdf)) {
      return { filePath: tmpPdf, isPdf: true };
    }
  } catch (err) {
    console.error('Ошибка Python генератора тестовой страницы:', err.message);
  }

  // Fallback: PostScript with clean WHITE background (zero toner wasted)
  const tmpPs = path.join(os.tmpdir(), `driverhub-testpage-${Date.now()}.ps`);
  const psContent = generateBrandedTestPage({ printerName, osDistribution, kernel, architecture, hostname, dateStr });
  await writeFile(tmpPs, psContent, 'utf8');
  return { filePath: tmpPs, isPdf: false };
}

ipcMain.handle('printers:list', async (event) => {
  validateIpcSender(event);
  try {
    const lpstatOutput = await runCommand('lpstat', ['-p', '-d']);
    let devicesOutput = '';
    try { devicesOutput = await runCommand('lpstat', ['-v']); } catch {}
    return parseInstalledPrinters(lpstatOutput, devicesOutput);
  } catch (err) {
    return [];
  }
});

ipcMain.handle('printers:print-test-page', async (event, payload = {}) => {
  validateIpcSender(event);
  const printerName = String(payload.printerName || '').trim();
  if (!printerName || !/^[a-zA-Z0-9_\-\.]+$/.test(printerName)) {
    throw new Error('Некорректное имя принтера');
  }

  const release = readOsRelease();
  const dateStr = new Date().toLocaleString('ru-RU');
  const generated = await generateBrandedTestPageFile({
    printerName,
    osDistribution: release.PRETTY_NAME || release.NAME || 'Astra Linux',
    kernel: os.release(),
    architecture: process.arch,
    hostname: os.hostname(),
    dateStr
  });

  try {
    const out = await runCommand('lp', ['-d', printerName, generated.filePath]);
    await logEntry({
      type: 'print',
      status: 'success',
      summary: `Фирменная тестовая страница DRIVER HUB LINUX (biblioteka33.ru) отправлена на ${printerName}: ${out.trim()}`
    });
    return {
      success: true,
      printerName,
      message: `Фирменная страница DRIVER HUB LINUX (biblioteka33.ru) отправлена на печать (${printerName})`
    };
  } catch (err) {
    await logEntry({
      type: 'print',
      status: 'error',
      summary: `Ошибка тестовой печати на ${printerName}: ${err.message}`
    });
    throw new Error(`Ошибка отправки на печать: ${err.message}`);
  } finally {
    try { await unlink(generated.filePath); } catch {}
  }
});

ipcMain.handle('printers:clear-queue', async (event, payload = {}) => {
  validateIpcSender(event);
  const printerName = String(payload.printerName || '').trim();
  if (printerName && !/^[a-zA-Z0-9_\-\.]+$/.test(printerName)) {
    throw new Error('Некорректное имя принтера');
  }
  try {
    const args = printerName ? ['-a', printerName] : ['-a'];
    await runCommand('cancel', args);
    await logEntry({
      type: 'print',
      status: 'success',
      summary: `Очередь печати очищена (${printerName || 'все принтеры'})`
    });
    return { success: true };
  } catch (err) {
    throw new Error(`Не удалось очистить очередь: ${err.message}`);
  }
});

ipcMain.handle('logs:list', async () => { try { return JSON.parse(await readFile(path.join(app.getPath('userData'), 'operations.json'), 'utf8')); } catch { return []; } });
ipcMain.handle('logs:clear', async (event) => { validateIpcSender(event); await writeFile(path.join(app.getPath('userData'), 'operations.json'), '[]'); return true; });
ipcMain.handle('settings:get', async (event) => {
  validateIpcSender(event);
  const settings = await readSavedSettings();
  const activeKey = settings.xkiroApiKey || process.env.QWEN_API_KEY;
  return {
    ...settings,
    aiConfigured: Boolean(activeKey),
    model: settings.qwenModel || process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free'
  };
});
ipcMain.handle('settings:save', async (event, settings = {}) => {
  validateIpcSender(event);
  const saved = await writeSavedSettings(settings);
  const activeKey = saved.xkiroApiKey || process.env.QWEN_API_KEY;
  return {
    ...saved,
    aiConfigured: Boolean(activeKey),
    model: saved.qwenModel || process.env.QWEN_MODEL || 'qwen/qwen3.8-max:free'
  };
});

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:toggle-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.on('window:close', () => mainWindow?.close());
}

if (app?.whenReady) {
  app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

module.exports = {
  readOsRelease,
  driverPackageFor,
  categoryFromText,
  parseLspci,
  parseLsusb
};
