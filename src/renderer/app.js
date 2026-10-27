const DEFAULT_CLIENT_SETTINGS = {
  autoScan: true,
  aiEnabled: true,
  sendDiagnostics: false,
  notifications: true,
  xkiroApiKey: '',
  xkiroBaseUrl: 'https://api.xkiro.com/v1',
  qwenModel: 'qwen/qwen3.8-max:free'
};

const state = {
  page: 'home',
  devices: [],
  system: null,
  issues: [],
  logs: [],
  settings: { ...DEFAULT_CLIENT_SETTINGS },
  scanning: false,
  diagnosticsRunning: false,
  ai: null,
  demo: false,
  query: '',
  freeModels: [],
  agentMessages: [
    {
      role: 'agent',
      content: 'Здравствуйте! Я системный ИИ-агент DriverHub для Linux (включая Astra Linux, Debian и Ubuntu).\n\nУ меня есть прямой доступ к состоянию системы, принтерам, модулям ядра и диагностике оборудования. Чем я могу помочь?'
    }
  ],
  installedPrinters: [],
  agentRunning: false,
  canonSelectedModel: 'LBP2900',
  showApiKey: false,
  testStatus: null,
  rebootRequired: false,
  rebootDetails: null
};

const BRAND_ICONS = {
  alert: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 18H2zM12 9v5m0 3v.1"/></g>',
  bluetooth: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20l7-6-14-9m0 10L19 8l-7-6"/></g>',
  check: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></g>',
  chevron_right: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></g>',
  cpu: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/></g>',
  disk: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 16h10M12 6v4"/></g>',
  download: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13m-5-5 5 5 5-5M4 21h16"/></g>',
  error: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></g>',
  gpu: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M5 2v3m14-3v3M5 19v3m14-3v3"/></g>',
  home: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></g>',
  info: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.5"/></g>',
  keyboard: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 13h1m3 0h1m3 0h1m3 0h1M7 16h10"/></g>',
  lock: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></g>',
  monitor: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="15" rx="2"/><path d="M12 18v4m-6 0h12"/></g>',
  network: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/></g>',
  package: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5m-9 5v10"/></g>',
  printer: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 15h12v7H6z"/></g>',
  refresh: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/></g>',
  rollback: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5M4 9h11a6 6 0 0 1 0 12h-3"/></g>',
  search: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></g>',
  settings: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M10 2h4l1 3 2 1 3-1 2 4-2 2v2l2 2-2 4-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-4 2-2v-2L2 9l2-4 3 1 2-1z"/></g>',
  shield: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 4v6c0 6-4 9-9 11-5-2-9-5-9-11V6z"/><path d="m8 12 3 3 5-6"/></g>',
  volume: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6h4l5 4V5L7 9zm12 0a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/></g>',
  bolt: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7v8l9-12h-7z"/></g>',
  send: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-11 11M22 2l-7 20-4-9-9-4z"/></g>',
  delete_sweep: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6m4-6v6"/></g>',
  description: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8m8 4H8m2-8H8"/></g>',
  close: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></g>'
};

// Aliases for component convenience
BRAND_ICONS.print = BRAND_ICONS.printer;
BRAND_ICONS.warning = BRAND_ICONS.alert;
BRAND_ICONS.build = BRAND_ICONS.shield;
BRAND_ICONS.smart_toy = BRAND_ICONS.cpu;
BRAND_ICONS.history = BRAND_ICONS.rollback;
BRAND_ICONS.videogame_asset = BRAND_ICONS.gpu;
BRAND_ICONS.wifi = BRAND_ICONS.network;
BRAND_ICONS.volume_up = BRAND_ICONS.volume;
BRAND_ICONS.storage = BRAND_ICONS.disk;
BRAND_ICONS.memory = BRAND_ICONS.cpu;
BRAND_ICONS.auto_awesome = BRAND_ICONS.bolt;
BRAND_ICONS.check_circle = BRAND_ICONS.check;

function brandIcon(name, size = 20, className = '') {
  const content = BRAND_ICONS[name] || BRAND_ICONS.cpu;
  return `<svg class="brand-icon ${className}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${content}</svg>`;
}
const materialIcon = brandIcon;

const categoryIconName = (category) => ({
  printer: 'printer',
  graphics: 'gpu',
  network: 'network',
  audio: 'volume',
  bluetooth: 'bluetooth',
  input: 'keyboard',
  storage: 'disk',
  other: 'cpu'
}[category] || 'cpu');

const navItems = [
  ['home', 'home', 'Главная'],
  ['search', 'search', 'Поиск драйверов'],
  ['install', 'download', 'Установка'],
  ['printers', 'printer', 'Принтеры и печать'],
  ['repair', 'shield', 'Исправление ошибок'],
  ['agent', 'cpu', 'ИИ-Агент'],
  ['logs', 'rollback', 'Журнал'],
  ['settings', 'settings', 'Настройки']
];

const el = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function formatMarkdown(content) {
  if (!content) return '';
  let text = escapeHtml(content);

  // Fenced code blocks
  text = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_m, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Headers
  text = text.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');

  // Lines processing for lists, code and paragraphs
  const lines = text.split('\n');
  let inList = false;
  let inOrderedList = false;
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      if (inList) { result.push('</ul>'); inList = false; }
      if (inOrderedList) { result.push('</ol>'); inOrderedList = false; }
      continue;
    }

    // Unordered bullet list items: •, -, *
    const bulletMatch = line.match(/^([•\-\*])\s+(.+)$/);
    if (bulletMatch) {
      if (inOrderedList) { result.push('</ol>'); inOrderedList = false; }
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push(`<li>${bulletMatch[2]}</li>`);
      continue;
    }

    // Ordered list items: 1. ...
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      if (inList) { result.push('</ul>'); inList = false; }
      if (!inOrderedList) { result.push('<ol>'); inOrderedList = true; }
      result.push(`<li>${orderedMatch[2]}</li>`);
      continue;
    }

    if (inList) { result.push('</ul>'); inList = false; }
    if (inOrderedList) { result.push('</ol>'); inOrderedList = false; }

    if (line.startsWith('<pre>') || line.startsWith('<h') || line.startsWith('<blockquote>')) {
      result.push(line);
    } else {
      result.push(`<p>${line}</p>`);
    }
  }

  if (inList) result.push('</ul>');
  if (inOrderedList) result.push('</ol>');

  return result.join('\n');
}

const statusClass = (status) => ({ ok: 'success', recommended: 'warning', warning: 'warning', problem: 'danger', unknown: 'muted' }[status] || 'muted');
const statusLabel = (status, text) => text || ({ ok: 'Работает корректно', recommended: 'Рекомендуется установить драйвер', warning: 'Требуется перезагрузка', problem: 'Обнаружены проблемы', unknown: 'Неизвестно' }[status] || 'Неизвестно');

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const SYSTEM_DRIVER_SUITES = [
  {
    packageName: 'printer-driver-cjet',
    name: 'Драйвер Canon LBP Laser (cjet)',
    category: 'printer',
    description: 'Официальный драйверный фильтр CaPSL / LBP для принтеров Canon в Astra Linux и Debian.',
    size: '25.4 KB',
    isCanon: true
  },
  {
    packageName: 'cups',
    name: 'Подсистема печати CUPS',
    category: 'printer',
    description: 'Сервер очереди печати CUPS, модули растрирования и сетевые интерфейсы управления.',
    size: '292 KB'
  },
  {
    packageName: 'printer-driver-foo2zjs',
    name: 'Драйвер ZjStream (foo2zjs)',
    category: 'printer',
    description: 'Драйвер для лазерных принтеров HP LaserJet, Minolta и Samsung с протоколом ZjStream.',
    size: '146 KB'
  },
  {
    packageName: 'printer-driver-all',
    name: 'Мета-пакет открытых драйверов печати',
    category: 'printer',
    description: 'Полный набор свободных драйверов для принтеров HP, Canon, Epson, Brother, Kyocera.',
    size: '1.4 MB'
  },
  {
    packageName: 'firmware-iwlwifi',
    name: 'Микрокод Intel Wireless Wi-Fi / Bluetooth',
    category: 'network',
    description: 'Официальные бинарные прошивки для беспроводных сетевых адаптеров Intel (AX200/AX201, Wi-Fi 6).',
    size: '18.4 MB'
  },
  {
    packageName: 'bluez',
    name: 'Стек протоколов Bluetooth (BlueZ)',
    category: 'network',
    description: 'Службы bluetoothd, сопряжение периферии, профили звука A2DP и беспроводных клавиатур/мышей.',
    size: '1.2 MB'
  },
  {
    packageName: 'linux-firmware',
    name: 'Базовый микрокод ядра Linux',
    category: 'cpu',
    description: 'Универсальные прошивки для видеоадаптеров AMD/Intel, аудиочипов и сетевых интерфейсов.',
    size: '240 MB'
  },
  {
    packageName: 'nvidia-driver',
    name: 'Проприетарный драйвер NVIDIA',
    category: 'gpu',
    description: 'Драйвер с аппаратным ускорением 3D и поддержкой CUDA для видеокарт NVIDIA GeForce / RTX.',
    size: '380 MB'
  }
];

let activeProgress = {
  active: false,
  title: 'Установка драйвера',
  percent: 0,
  stage: 'prepare',
  detail: '',
  logs: [],
  bytesDownloaded: 0,
  bytesTotal: 0,
  speed: '',
  eta: '',
  packageName: '',
  printerName: '',
  isPrinter: false
};

function renderNav() {
  el('#navigation').innerHTML = navItems.map(([id, icon, label]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${materialIcon(icon, 18, 'nav-mat-icon')}</span><span>${label}</span></button>`).join('');
}

function renderProgressModal() {
  const root = el('#modal-root');
  if (!root) return;
  if (!activeProgress.active) {
    root.innerHTML = '';
    return;
  }

  const isDone = activeProgress.percent >= 100;
  const isError = activeProgress.stage === 'error';
  const isPrinter = Boolean(activeProgress.isPrinter || /cjet|canon|cups|foo2zjs|printer/i.test(activeProgress.packageName || activeProgress.title || ''));
  const stageName = activeProgress.stage === 'download' ? 'Скачивание' :
                    activeProgress.stage === 'verify' ? 'Проверка' :
                    activeProgress.stage === 'install' ? 'Установка' :
                    activeProgress.stage === 'configure' ? 'Настройка' :
                    isDone ? 'Завершено' :
                    isError ? 'Ошибка' : 'Подготовка';

  const telemetryHtml = (activeProgress.stage === 'download' || activeProgress.bytesDownloaded > 0) ? `
    <div class="download-telemetry-row">
      <div class="download-telemetry-item">
        ${brandIcon('download', 14)}
        <span><b>${activeProgress.bytesDownloaded ? formatBytes(activeProgress.bytesDownloaded) : '0 B'}</b> / ${activeProgress.bytesTotal ? formatBytes(activeProgress.bytesTotal) : '—'}</span>
      </div>
      <div class="download-telemetry-item">
        ${brandIcon('bolt', 14)}
        <span>${activeProgress.speed || 'Загрузка...'}</span>
      </div>
      <div class="download-telemetry-item">
        ${brandIcon('refresh', 14)}
        <span>${activeProgress.eta ? 'Осталось: ' + activeProgress.eta : ''}</span>
      </div>
    </div>
  ` : '';

  root.innerHTML = `
    <div class="modal-backdrop" id="progress-modal-backdrop">
      <div class="progress-modal">
        <div class="progress-title-row">
          <div>
            <span class="progress-stage-pill ${activeProgress.stage}">${brandIcon(isDone ? 'check' : isError ? 'alert' : 'download', 13)} &nbsp; ${stageName}</span>
            <h2 style="margin-top: 6px;">${escapeHtml(activeProgress.title || 'Установка драйвера')}</h2>
          </div>
          <span class="progress-percent-badge">${activeProgress.percent}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${isDone ? 'completed' : isError ? 'error' : ''}" style="width: ${activeProgress.percent}%"></div>
        </div>
        ${telemetryHtml}
        <div class="progress-status-text">${escapeHtml(activeProgress.detail || 'Подготовка компонентов...')}</div>
        <div class="progress-steps-list">
          <div class="step-item ${activeProgress.percent >= 10 ? 'done' : 'active'}">
            <span class="step-bullet">${activeProgress.percent >= 10 ? '✓' : '1'}</span>
            <span>Поиск пакета и проверка репозиториев Linux</span>
          </div>
          <div class="step-item ${activeProgress.percent >= 50 ? 'done' : activeProgress.percent >= 10 ? 'active' : ''}">
            <span class="step-bullet">${activeProgress.percent >= 50 ? '✓' : '2'}</span>
            <span>Реальное скачивание пакетов драйвера в систему</span>
          </div>
          <div class="step-item ${activeProgress.percent >= 55 ? 'done' : activeProgress.percent >= 50 ? 'active' : ''}">
            <span class="step-bullet">${activeProgress.percent >= 55 ? '✓' : '3'}</span>
            <span>Проверка контрольных сумм и целостности deb архивов</span>
          </div>
          <div class="step-item ${activeProgress.percent >= 90 ? 'done' : activeProgress.percent >= 55 ? 'active' : ''}">
            <span class="step-bullet">${activeProgress.percent >= 90 ? '✓' : '4'}</span>
            <span>Инсталляция модулей через Polkit и системный Dpkg</span>
          </div>
          <div class="step-item ${activeProgress.percent >= 100 ? 'done' : activeProgress.percent >= 90 ? 'active' : ''}">
            <span class="step-bullet">${activeProgress.percent >= 100 ? '✓' : '5'}</span>
            <span>Настройка ядра (usblp), правил udev, групп lp и служб CUPS</span>
          </div>
        </div>
        <div class="live-log-box" id="live-log-box">${escapeHtml(activeProgress.logs.slice(-8).join('\n') || 'Инициализация протокола установки...')}</div>
        ${isDone && Boolean(activeProgress.rebootRequired) ? `
          <div class="reboot-notice-box" style="margin-top: 14px;">
            <span style="color: #F59E0B; font-size: 20px; flex-shrink: 0;">${brandIcon('alert', 20)}</span>
            <div>
              <strong style="color: #FFFFFF;">Внимание: Требуется перезагрузка системы</strong>
              <div style="margin-top: 2px; color: #D1D5DB; font-size: 12px;">Пакет установлен в систему. Для загрузки обновленного модуля ядром Linux требуется перезагрузить компьютер.</div>
            </div>
          </div>
        ` : ''}
        <div class="modal-actions" style="margin-top: 18px; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
          ${isDone && Boolean(activeProgress.rebootRequired) ? `
            <button class="btn btn-warning" id="btn-progress-reboot-now">
              ${brandIcon('refresh', 16)} &nbsp; Перезагрузить компьютер
            </button>
          ` : ''}
          ${isDone && isPrinter ? `
            <button class="btn btn-primary" id="btn-print-test-now">
              ${brandIcon('printer', 16)} &nbsp; Напечатать фирменную страницу проверки
            </button>
          ` : ''}
          <button class="btn ${isDone ? (activeProgress.rebootRequired ? 'btn-secondary' : 'btn-success') : 'btn-secondary'}" id="btn-close-progress" ${isDone || isError ? '' : 'disabled'}>
            ${isDone ? (activeProgress.rebootRequired ? 'Закрыть (перезагрузить позже)' : (brandIcon('check', 14) + ' &nbsp; Готово')) : isError ? 'Закрыть' : 'Выполняется установка...'}
          </button>
        </div>
      </div>
    </div>
  `;

  const box = el('#live-log-box');
  if (box) box.scrollTop = box.scrollHeight;

  el('#btn-close-progress')?.addEventListener('click', () => {
    const needReboot = Boolean(activeProgress.rebootRequired);
    const pkg = activeProgress.packageName;
    const dev = activeProgress.deviceName;
    activeProgress.active = false;
    el('#modal-root').innerHTML = '';
    scan();
    if (needReboot) {
      renderRebootModal(pkg, dev);
    }
  });

  el('#btn-progress-reboot-now')?.addEventListener('click', () => {
    const pkg = activeProgress.packageName;
    const dev = activeProgress.deviceName;
    activeProgress.active = false;
    el('#modal-root').innerHTML = '';
    renderRebootModal(pkg, dev);
  });

  el('#btn-print-test-now')?.addEventListener('click', () => {
    activeProgress.active = false;
    el('#modal-root').innerHTML = '';
    state.page = 'printers';
    render();
    const targetPrinter = activeProgress.printerName || state.installedPrinters?.[0]?.name || 'Canon-Printer';
    printTestPage(targetPrinter);
  });
}

function renderRebootModal(packageName = '', deviceName = '') {
  const pkg = packageName || state.rebootDetails?.packageName || 'Драйвер Linux';
  const dev = deviceName || state.rebootDetails?.deviceName || 'Оборудование';

  el('#modal-root').innerHTML = `
    <div class="modal-backdrop" id="reboot-modal-backdrop">
      <div class="modal reboot-warning-modal">
        <button class="modal-close" id="btn-reboot-close-x">×</button>
        <div class="reboot-icon-wrap">
          ${brandIcon('alert', 36)}
        </div>
        <span class="reboot-pkg-badge">
          ${brandIcon('check', 13)} &nbsp; Пакет ${escapeHtml(pkg)} успешно установлен
        </span>
        <h2 style="margin: 0 0 10px; font-size: 20px; color: #FFFFFF;">Внимание! Требуется перезагрузка</h2>
        <div class="reboot-modal-desc">
          Драйвер для <b>${escapeHtml(dev)}</b> был успешно загружен и интегрирован в систему, однако модуль ядра Linux не может быть активирован на лету без перезапуска операционной системы.
        </div>
        <div class="reboot-notice-box">
          <span style="font-size: 18px; line-height: 1; flex-shrink: 0;">⚠</span>
          <div>
            <b>Предупреждение:</b> Для безопасного завершения настройки оборудования сохраните все открытые документы перед перезагрузкой компьютера.
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 24px;">
          <button class="btn btn-secondary" id="btn-reboot-later">Перезагрузить позже</button>
          <button class="btn btn-warning" id="btn-reboot-confirm">
            ${brandIcon('refresh', 16)} &nbsp; Перезагрузить сейчас
          </button>
        </div>
      </div>
    </div>
  `;

  const closeRebootDialog = () => {
    state.rebootRequired = true;
    el('#modal-root').innerHTML = '';
    render();
  };

  el('#btn-reboot-close-x')?.addEventListener('click', closeRebootDialog);
  el('#btn-reboot-later')?.addEventListener('click', closeRebootDialog);
  el('#reboot-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'reboot-modal-backdrop') closeRebootDialog();
  });

  el('#btn-reboot-confirm')?.addEventListener('click', async () => {
    const btn = el('#btn-reboot-confirm');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> &nbsp; Перезагрузка...';
    }
    toast('Отправка команды перезагрузки системы...', 'info');
    try {
      await window.driverHub.system.reboot();
    } catch (err) {
      toast(`Ошибка вызова перезагрузки: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `${brandIcon('refresh', 16)} &nbsp; Попробовать снова`;
      }
    }
  });
}

function rebootBanner() {
  const isReboot = state.rebootRequired || state.devices.some(d => d.rebootRequired || d.status === 'warning' || (d.statusText && d.statusText.includes('перезагрузка')));
  if (!isReboot) return '';

  const rebootDev = state.devices.find(d => d.rebootRequired || d.status === 'warning' || (d.statusText && d.statusText.includes('перезагрузка')));
  const pkgName = state.rebootDetails?.packageName || rebootDev?.recommendation?.name || 'linux-firmware';
  const devName = state.rebootDetails?.deviceName || rebootDev?.name || 'Оборудование';

  return `
    <div class="reboot-banner">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="color: #F59E0B; font-size: 22px; flex-shrink: 0;">${brandIcon('alert', 22)}</span>
        <div>
          <strong style="color: #FFFFFF; font-size: 14px;">Внимание: Для применения установленных драйверов требуется перезагрузка</strong>
          <div style="font-size: 12px; color: #E5E7EB; margin-top: 2px;">Драйверы установлены в систему, но модули ядра Linux будут активированы после перезагрузки компьютера.</div>
        </div>
      </div>
      <button class="btn btn-warning btn-small" data-action="reboot-system" data-package="${escapeHtml(pkgName)}" data-device="${escapeHtml(devName)}" style="flex-shrink: 0;">
        ${brandIcon('refresh', 14)} &nbsp; Перезагрузить сейчас
      </button>
    </div>
  `;
}

function canonBanner() {
  return `
    <div class="canon-special-card">
      <div class="canon-special-info">
        <div class="canon-special-icon">${brandIcon('printer', 28)}</div>
        <div class="canon-special-copy">
          <div class="card-label">ASTRA LINUX & DEBIAN СПЕЦ-КОМПЛЕКС</div>
          <h3>Canon i-SENSYS LBP (2900 / 3000 / 6000 / 6020 / 6030)</h3>
          <p>Специальная настройка для Astra Linux: устраняет зависание USB, активирует модуль <code>usblp</code>, создает FIFO-буфер <code>ccpd</code> и регистрирует правила udev для авто-подключения.</p>
        </div>
      </div>
      <div class="canon-special-action">
        <select class="canon-select" id="canon-model-select">
          <option value="LBP2900" ${state.canonSelectedModel === 'LBP2900' ? 'selected' : ''}>Canon LBP2900 / 2900B</option>
          <option value="LBP3000" ${state.canonSelectedModel === 'LBP3000' ? 'selected' : ''}>Canon LBP3000</option>
          <option value="LBP6000" ${state.canonSelectedModel === 'LBP6000' ? 'selected' : ''}>Canon LBP6000 / 6018</option>
          <option value="LBP6020" ${state.canonSelectedModel === 'LBP6020' ? 'selected' : ''}>Canon LBP6020</option>
          <option value="LBP6030" ${state.canonSelectedModel === 'LBP6030' ? 'selected' : ''}>Canon LBP6030 / 6030B</option>
        </select>
        <button class="btn btn-success" data-action="install-canon">
          ${brandIcon('download', 16)} &nbsp; Скачать и настроить
        </button>
      </div>
    </div>
  `;
}

function deviceRow(device) {
  const isCanon = /canon.*lbp|04a9:/i.test(`${device.name} ${device.detail || ''}`);
  const packageName = device.recommendation?.name;
  const isReboot = Boolean(device.rebootRequired || device.status === 'warning' || (device.statusText && device.statusText.includes('перезагрузка')));
  const action = isCanon
    ? `<button class="btn btn-success btn-small" data-action="install-canon">${brandIcon('printer', 14)} &nbsp; Настроить LBP</button>`
    : isReboot
      ? `<button class="btn btn-warning btn-small" data-action="reboot-system" data-package="${escapeHtml(packageName || '')}" data-device="${escapeHtml(device.name)}">${brandIcon('refresh', 14)} &nbsp; Перезагрузить</button>`
      : device.status === 'problem' || device.status === 'recommended'
        ? `<button class="btn btn-${device.status === 'problem' ? 'purple' : 'success'} btn-small" data-install="${escapeHtml(packageName || '')}" data-device="${escapeHtml(device.name)}">${brandIcon(device.status === 'problem' ? 'bolt' : 'download', 14)} &nbsp; ${device.status === 'problem' ? 'Исправить' : 'Установить'}</button>`
        : `<button class="btn btn-secondary btn-small" data-reinstall="${escapeHtml(device.name)}">${brandIcon('refresh', 14)} &nbsp; Переустановить</button>`;

  const driverText = device.driver || 'не определён';
  const versionText = device.version || '—';
  const statusTitle = statusLabel(device.status, device.statusText);
  const statusDetail = device.recommendation?.reason || (device.status === 'ok' ? 'Основной модуль загружен' : device.source || 'Проверьте состояние');

  return `<div class="device-row">
    <div class="device-name">
      <span class="device-icon icon-${device.category}">${brandIcon(categoryIconName(device.category), 20)}</span>
      <div class="device-title-wrap">
        <strong title="${escapeHtml(device.name)}">${escapeHtml(device.name)}</strong>
        <span title="${escapeHtml(device.detail || '')}">${escapeHtml(device.detail || 'Устройство')}</span>
      </div>
    </div>
    <div class="driver-cell">
      <strong title="${escapeHtml(driverText)}">${escapeHtml(driverText)}</strong>
      <span title="${escapeHtml(versionText)}">${escapeHtml(versionText)}</span>
    </div>
    <div class="status-cell">
      <span class="status-badge ${statusClass(device.status)}" title="${escapeHtml(statusTitle)}: ${escapeHtml(statusDetail)}">
        <span class="status-dot ${statusClass(device.status)}">${brandIcon(device.status === 'problem' ? 'error' : (device.status === 'recommended' || isReboot) ? 'alert' : 'check', 13)}</span>
        <div class="status-copy ${statusClass(device.status)}">
          <strong title="${escapeHtml(statusTitle)}">${escapeHtml(statusTitle)}</strong>
          <span title="${escapeHtml(statusDetail)}">${escapeHtml(statusDetail)}</span>
        </div>
      </span>
    </div>
    <div class="device-action">
      ${action}
      <button class="more-btn" aria-label="Дополнительные действия">⌄</button>
    </div>
  </div>`;
}

function systemStatus() {
  const critical = state.issues.filter((issue) => issue.severity === 'critical').length;
  const warnings = state.issues.filter((issue) => issue.severity === 'warning').length;
  if (critical) return { icon: 'error', title: 'Требуется внимание', text: `${critical} критическая проблема обнаружена`, className: 'danger' };
  if (warnings) return { icon: 'alert', title: 'Есть рекомендации', text: `${warnings} проверки требуют внимания`, className: 'warning' };
  return { icon: 'check', title: 'Система в порядке', text: 'Критических ошибок не обнаружено', className: 'success' };
}

function homePage() {
  const system = systemStatus();
  const okCount = state.devices.filter(d => d.status === 'ok').length;
  const updatesCount = state.devices.filter(d => d.recommendation || d.status === 'problem' || d.status === 'recommended').length;

  return `<div class="page-header hero-header"><div class="hero-icon"><img src="../assets/icons/driverhub-128.png" class="hero-gear-img" alt="Driver Hub" /></div><div class="hero-copy"><h1>Driver <b>Hub</b></h1><p>Ваш Linux под полным контролем</p><span>Профессиональный менеджер оборудования, драйверов и модулей ядра.<br class="desktop-only" /> Точность, надежность и безопасная настройка системы.</span></div><div class="system-card ${system.className}"><div class="system-card-top"><span class="big-status">${brandIcon(system.icon, 30)}</span><div><strong>${system.title}</strong><span>${system.text}</span><span>${state.devices.length || '—'} основных устройств проверено</span></div></div><button class="btn btn-primary" data-action="diagnose" ${state.diagnosticsRunning ? 'disabled' : ''}>${brandIcon('refresh', 16)} &nbsp; ${state.diagnosticsRunning ? 'Проверка…' : 'Проверить сейчас'}</button></div></div>
  ${rebootBanner()}
  <div class="summary-cards-row">
    <div class="summary-card">
      <div class="summary-card-head">
        <h3>Найдено устройств</h3>
        <span class="tag">${brandIcon('cpu', 13)} &nbsp; Оборудование</span>
      </div>
      <div class="big">${state.devices.length || 0}</div>
      <div class="sub">Обнаружено в системе Linux</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-head">
        <h3>Работают корректно</h3>
        <span class="tag">${brandIcon('check', 13)} &nbsp; В порядке</span>
      </div>
      <div class="big">${okCount}</div>
      <div class="sub">Модули ядра и шины активны</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-head">
        <h3>Требуют внимания</h3>
        <span class="tag ${updatesCount ? 'warning' : ''}">${brandIcon(updatesCount ? 'alert' : 'check', 13)} &nbsp; ${updatesCount ? 'Обновления' : 'В норме'}</span>
      </div>
      <div class="big">${updatesCount}</div>
      <div class="sub">${updatesCount ? 'Доступны пакеты к установке' : 'Все драйверы настроены'}</div>
    </div>
  </div>
  <div class="quick-grid">
    <button class="quick-card blue" data-page="search">
      <span class="quick-icon">${brandIcon('search', 24)}</span>
      <div><strong>Поиск драйверов</strong><span>Анализ устройств и поиск<br />совместимых драйверов</span></div>
    </button>
    <button class="quick-card green" data-page="install">
      <span class="quick-icon">${brandIcon('download', 24)}</span>
      <div><strong>Установка</strong><span>Автоматическая установка<br />драйверов в систему</span></div>
    </button>
    <button class="quick-card green" data-page="printers">
      <span class="quick-icon">${brandIcon('printer', 24)}</span>
      <div><strong>Принтеры и печать</strong><span>Управление CUPS и печать<br />фирменной страницы</span></div>
    </button>
    <button class="quick-card purple" data-page="repair">
      <span class="quick-icon">${brandIcon('shield', 24)}</span>
      <div><strong>Исправление ошибок</strong><span>Диагностика и устранение<br />проблем с драйверами</span></div>
    </button>
    <button class="quick-card grey" data-page="agent">
      <span class="quick-icon">${brandIcon('bolt', 24)}</span>
      <div><strong>ИИ-Агент системы</strong><span>Умный агент для решения<br />любых проблем с драйверами</span></div>
    </button>
  </div>
  ${canonBanner()}
  ${state.demo ? '<div class="demo-banner"><span>●</span> Системные утилиты не обнаружены — интерфейс работает в демонстрационном режиме. Установите <b>pciutils</b> и <b>usbutils</b> для реального сканирования.</div>' : ''}
  <section class="section"><div class="section-title"><h2>Обнаруженные устройства</h2><button class="btn btn-primary" data-action="scan" ${state.scanning ? 'disabled' : ''}>${brandIcon('refresh', 16)} &nbsp; ${state.scanning ? 'Сканирование…' : 'Сканировать устройства'}</button></div><div class="device-table"><div class="table-head"><span>Устройство</span><span>Текущий драйвер</span><span>Статус</span><span>Действия</span></div>${state.scanning ? '<div class="loading-row"><span class="spinner"></span> Анализ оборудования…</div>' : state.devices.length ? state.devices.map(deviceRow).join('') : '<div class="empty-row">Устройства пока не сканировались</div>'}</div></section>
  <section class="repair-panel"><div class="repair-heading"><span class="repair-icon">${brandIcon('shield', 26)}</span><div><h2>Исправление системных ошибок</h2><p>Автоматическое обнаружение и исправление проблем, связанных с драйверами и конфигурацией системы.</p></div></div><div class="repair-bottom"><div class="checks">${['Проверить конфигурацию системы', 'Сбросить настройки устройств', 'Очистить устаревшие драйверы', 'Исправить сломанные зависимости', 'Восстановить загрузку модулей', 'Применить рекомендации'].map((item, index) => `<label><input type="checkbox" ${index === 0 || index === 3 || index === 5 ? 'checked' : ''} /> <span>${item}</span></label>`).join('')}</div><button class="btn btn-purple repair-button" data-action="agent-auto-repair" ${state.diagnosticsRunning ? 'disabled' : ''}>${brandIcon('bolt', 16)} &nbsp; ${state.diagnosticsRunning ? 'Выполняется диагностика…' : 'Проверить и исправить с ИИ'}</button></div></section>`;
}

function renderDriverResults(devices) {
  if (!devices.length) {
    return `<div class="empty-state"><span>${brandIcon('search', 40)}</span><h3>Устройства не найдены</h3><p>Запустите сканирование или измените запрос.</p></div>`;
  }
  return devices.map((device) => {
    const isCanon = /canon|04a9:|lbp/i.test(`${device.name} ${device.detail || ''}`);
    const isReboot = Boolean(device.rebootRequired || device.status === 'warning' || (device.statusText && device.statusText.includes('перезагрузка')));
    const buttonHtml = isCanon
      ? `<button class="btn btn-success btn-small" data-action="install-canon">${brandIcon('printer', 14)} &nbsp; Настроить Canon LBP</button>`
      : isReboot
        ? `<button class="btn btn-warning btn-small" data-action="reboot-system" data-package="${escapeHtml(device.recommendation?.name || '')}" data-device="${escapeHtml(device.name)}">${brandIcon('refresh', 14)} &nbsp; Перезагрузить</button>`
        : device.recommendation
          ? `<button class="btn btn-primary btn-small" data-install="${escapeHtml(device.recommendation.name)}" data-device="${escapeHtml(device.name)}">${brandIcon('download', 14)} &nbsp; Скачать и установить</button>`
          : `<button class="btn btn-secondary btn-small" data-reinstall="${escapeHtml(device.name)}">${brandIcon('refresh', 14)} &nbsp; Скачать / переустановить</button>`;

    return `<article class="driver-card"><div class="driver-card-icon icon-${escapeHtml(device.category || 'other')}">${brandIcon(categoryIconName(device.category), 24)}</div><div class="driver-card-main"><div class="card-label">${escapeHtml(device.source || 'Система')}</div><h3>${escapeHtml(device.name)}</h3><p>${escapeHtml(device.detail || 'Аппаратное устройство')}</p><div class="driver-meta"><span>Текущий: <b>${escapeHtml(device.driver || 'не определён')}</b></span><span class="compat ${isReboot ? 'warning' : device.status === 'problem' ? 'bad' : 'good'}">● ${isReboot ? 'Требуется перезагрузка' : device.status === 'problem' ? 'Требует проверки' : 'Совместимо'}</span></div></div><div class="driver-card-action">${device.recommendation ? `<b>${escapeHtml(device.recommendation.name)}</b><span>${escapeHtml(device.recommendation.reason)}</span>` : ''}${buttonHtml}</div></article>`;
  }).join('');
}

function searchPage() {
  const filtered = state.devices.filter((device) => `${device.name} ${device.category} ${device.driver || ''}`.toLowerCase().includes(state.query.toLowerCase()));
  return `<div class="page-title"><div><span class="eyebrow">КАТАЛОГ СОВМЕСТИМОСТИ</span><h1>Поиск драйверов</h1><p>Проверьте оборудование и найдите подходящие пакеты из репозиториев системы.</p></div><button class="btn btn-primary" data-action="scan" ${state.scanning ? 'disabled' : ''}>${brandIcon('refresh', 16)} &nbsp; ${state.scanning ? 'Сканирование…' : 'Обновить список'}</button></div>${rebootBanner()}${canonBanner()}<div class="search-bar"><span>${brandIcon('search', 20)}</span><input id="driver-search" value="${escapeHtml(state.query)}" placeholder="Поиск по устройству, производителю или драйверу (например: Canon, LBP, Wi-Fi)..." /><span class="filter-pill">Все устройства⌄</span></div><div class="driver-results">${renderDriverResults(filtered)}</div>`;
}

function installPage() {
  const candidates = state.devices.filter((device) => device.recommendation);
  const okDevices = state.devices.filter((device) => !device.recommendation && device.driver && device.driver !== 'не определён');

  return `
    <div class="page-title">
      <div>
        <span class="eyebrow">БЕЗОПАСНАЯ УСТАНОВКА И СКАЧИВАНИЕ</span>
        <h1>Установка драйверов</h1>
        <p>Каждая операция выполняется через Polkit с реальным скачиванием и визуальным индикатором прогресса.</p>
      </div>
      ${candidates.length > 1 ? `
        <button class="btn btn-primary" id="btn-install-all-recommended">
          ${brandIcon('download', 16)} &nbsp; Установить все (${candidates.length})
        </button>
      ` : ''}
    </div>

    ${rebootBanner()}
    ${canonBanner()}

    <div class="notice-card">
      <span class="notice-icon">${brandIcon('check', 18)}</span>
      <div>
        <strong>Защищённый режим с реальным скачиванием и индикатором прогресса</strong>
        <p>DriverHub реально загружает пакеты из доверенных репозиториев, отображает скорость в реальном времени, проверяет контрольные суммы и настраивает службы ядра Linux.</p>
      </div>
    </div>

    <!-- Рекомендованные обновления оборудования -->
    <section class="section">
      <div class="section-title">
        <h2>Рекомендованные драйверы для вашего оборудования</h2>
        <span class="tag ${candidates.length ? 'warning' : ''}">${candidates.length} готово к загрузке</span>
      </div>
      <div class="install-list">
        ${candidates.length ? candidates.map((device) => {
          const isCanon = /canon|04a9:|lbp/i.test(`${device.name} ${device.detail || ''}`);
          const isReboot = Boolean(device.rebootRequired || device.status === 'warning' || (device.statusText && device.statusText.includes('перезагрузка')));
          return `
            <div class="install-item">
              <div class="device-icon icon-${escapeHtml(device.category || 'other')}">${brandIcon(categoryIconName(device.category), 22)}</div>
              <div>
                <h3>${escapeHtml(device.name)}</h3>
                <p>Рекомендуемый пакет: <b>${escapeHtml(device.recommendation?.name || 'Драйвер')}</b> — ${escapeHtml(device.recommendation?.reason || 'Официальный пакет')}</p>
              </div>
              <span class="install-status ${isReboot ? 'warning' : 'warning'}">${isReboot ? 'Требуется перезагрузка' : 'Готово к загрузке'}</span>
              ${isCanon ? `
                <button class="btn btn-success btn-small" data-action="install-canon">
                  ${brandIcon('printer', 14)} &nbsp; Настроить LBP
                </button>
              ` : isReboot ? `
                <button class="btn btn-warning btn-small" data-action="reboot-system" data-package="${escapeHtml(device.recommendation?.name || '')}" data-device="${escapeHtml(device.name)}">
                  ${brandIcon('refresh', 14)} &nbsp; Перезагрузить
                </button>
              ` : `
                <button class="btn btn-success btn-small" data-install="${escapeHtml(device.recommendation.name)}" data-device="${escapeHtml(device.name)}">
                  ${brandIcon('download', 14)} &nbsp; Скачать и установить
                </button>
              `}
            </div>
          `;
        }).join('') : `
          <div class="all-installed-card">
            <span class="badge-dot good"></span>
            <div>
              <strong>Все обнаруженные устройства имеют настроенные драйверы</strong>
              <p>Оборудование функционирует штатно. Ниже вы можете скачать или переустановить любые драйверные пакеты Linux.</p>
            </div>
          </div>
        `}
      </div>
    </section>

    <!-- Системный каталог драйверов Linux -->
    <section class="section" style="margin-top: 28px;">
      <div class="section-title">
        <h2>Каталог драйверных пакетов Linux (Astra Linux / Debian)</h2>
        <span class="tag">Доступно в репозитории</span>
      </div>
      <div class="package-catalog-grid">
        ${SYSTEM_DRIVER_SUITES.map((pkg) => `
          <div class="package-catalog-card">
            <div class="package-catalog-header">
              <div class="package-catalog-icon icon-${pkg.category}">
                ${brandIcon(pkg.category === 'printer' ? 'printer' : pkg.category === 'network' ? 'network' : pkg.category === 'gpu' ? 'gpu' : 'cpu', 22)}
              </div>
              <div class="package-catalog-title">
                <h3>${escapeHtml(pkg.name)}</h3>
                <code>${escapeHtml(pkg.packageName)}</code>
              </div>
            </div>
            <div class="package-catalog-desc">
              ${escapeHtml(pkg.description)}
            </div>
            <div class="package-catalog-footer">
              <span class="package-catalog-size">${pkg.size ? `Размер: ${pkg.size}` : 'Пакетный комплекс'}</span>
              ${pkg.isCanon ? `
                <button class="btn btn-success btn-small" data-action="install-canon">
                  ${brandIcon('printer', 14)} &nbsp; Скачать и настроить
                </button>
              ` : `
                <button class="btn btn-primary btn-small" data-install="${escapeHtml(pkg.packageName)}" data-device="${escapeHtml(pkg.name)}">
                  ${brandIcon('download', 14)} &nbsp; Скачать и установить
                </button>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Обнаруженные устройства с возможностью переустановки -->
    ${okDevices.length ? `
      <section class="section" style="margin-top: 24px;">
        <div class="section-title">
          <h2>Устройства с активными драйверами (доступна переустановка)</h2>
          <span class="tag">${okDevices.length} устройств</span>
        </div>
        <div class="install-list">
          ${okDevices.map((device) => `
            <div class="install-item">
              <div class="device-icon icon-${escapeHtml(device.category || 'other')}">${brandIcon(categoryIconName(device.category), 22)}</div>
              <div>
                <h3>${escapeHtml(device.name)}</h3>
                <p>Активный драйвер ядра: <b>${escapeHtml(device.driver)}</b> (${escapeHtml(device.version || 'Linux')})</p>
              </div>
              <span class="install-status good">Работает</span>
              <button class="btn btn-secondary btn-small" data-reinstall="${escapeHtml(device.name)}">
                ${brandIcon('refresh', 14)} &nbsp; Переустановить
              </button>
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}
  `;
}

function repairPage() {
  const system = systemStatus();
  const lpConfigured = Boolean(state.system?.userInLpGroup);
  const printersCount = state.installedPrinters?.length || 0;
  const criticalCount = state.issues.filter(i => i.severity === 'critical').length;

  return `
    <div class="page-title">
      <div>
        <span class="eyebrow">ДИАГНОСТИКА И ВОССТАНОВЛЕНИЕ LINUX</span>
        <h1>Исправление ошибок</h1>
        <p>Автоматическое обнаружение системных сбоев, прав доступа Astra Linux и мгновенное исправление через ИИ-Агента.</p>
      </div>
      <div class="page-title-actions">
        <button class="btn btn-purple" data-action="diagnose" ${state.diagnosticsRunning ? 'disabled' : ''}>
          ${brandIcon('refresh', 16)} &nbsp; ${state.diagnosticsRunning ? 'Диагностика…' : 'Запустить диагностику'}
        </button>
        <button class="btn btn-primary" data-action="agent-auto-repair" ${state.diagnosticsRunning ? 'disabled' : ''}>
          ${brandIcon('bolt', 16)} &nbsp; Исправить с ИИ
        </button>
      </div>
    </div>

    <!-- Diagnostic Banner Card -->
    <div class="diagnostic-banner-card ${system.className}">
      <div class="diagnostic-banner-left">
        <div class="diagnostic-status-circle ${system.className}">
          ${brandIcon(system.className === 'danger' ? 'error' : system.className === 'warning' ? 'alert' : 'check', 32)}
        </div>
        <div class="diagnostic-status-info">
          <div class="status-headline">
            <h2>${system.title}</h2>
            <span class="status-badge-pill ${system.className}">
              ${system.className === 'danger' ? 'Требуется внимание' : system.className === 'warning' ? 'Есть предупреждения' : 'В норме'}
            </span>
          </div>
          <p>${system.text}</p>
          <div class="diagnostic-telemetry-tags">
            <span class="diag-tag">
              ${brandIcon('monitor', 13)} &nbsp; ${escapeHtml(state.system?.distribution || 'Astra Linux')}
            </span>
            <span class="diag-tag">
              ${brandIcon('cpu', 13)} &nbsp; Ядро: ${escapeHtml(state.system?.kernel || 'Linux')}
            </span>
            <span class="diag-tag ${lpConfigured ? 'good' : 'bad'}">
              ${brandIcon(lpConfigured ? 'check' : 'alert', 13)} &nbsp; Группа lp: ${lpConfigured ? 'Включён ✓' : 'Не включён ⚠'}
            </span>
            <span class="diag-tag">
              ${brandIcon('printer', 13)} &nbsp; CUPS принтеров: ${printersCount}
            </span>
          </div>
        </div>
      </div>
      <div class="diagnostic-banner-right">
        <button class="btn btn-secondary btn-small" data-action="diagnose" ${state.diagnosticsRunning ? 'disabled' : ''}>
          ${brandIcon('refresh', 14)} &nbsp; Проверить сейчас
        </button>
      </div>
    </div>

    <!-- 4 Diagnostic Domains -->
    <div class="diagnostic-domains-grid">
      <div class="domain-card ${criticalCount ? 'warning' : ''}">
        <div class="domain-icon">${brandIcon('cpu', 22)}</div>
        <div class="domain-body">
          <strong>Модули ядра Linux</strong>
          <span>Драйверы шин, модуль usblp и поддержка оборудования</span>
          <div class="domain-status-row ok">
            ${brandIcon('check', 13)} &nbsp; Ядро активно (${state.devices.length || 0} устр.)
          </div>
        </div>
      </div>

      <div class="domain-card ${!lpConfigured ? 'warning' : ''}">
        <div class="domain-icon">${brandIcon('printer', 22)}</div>
        <div class="domain-body">
          <strong>Служба печати CUPS</strong>
          <span>Демоны cupsd, ccpd, PPD-файлы и очереди печати</span>
          <div class="domain-status-row ${printersCount ? 'ok' : 'warn'}">
            ${brandIcon(printersCount ? 'check' : 'info', 13)} &nbsp; ${printersCount ? `Очередь готова (${printersCount} принт.)` : 'Принтеры не добавлены'}
          </div>
        </div>
      </div>

      <div class="domain-card ${!lpConfigured ? 'warning' : ''}">
        <div class="domain-icon">${brandIcon('lock', 22)}</div>
        <div class="domain-body">
          <strong>Права Astra Linux</strong>
          <span>Группы lp/lpadmin, сокет /var/ccpd/fifo0, доступ /dev/usb</span>
          <div class="domain-status-row ${lpConfigured ? 'ok' : 'warn'}">
            ${brandIcon(lpConfigured ? 'check' : 'alert', 13)} &nbsp; ${lpConfigured ? 'Права настроены' : 'Требуется группа lp!'}
          </div>
        </div>
      </div>

      <div class="domain-card purple">
        <div class="domain-icon">${brandIcon('package', 22)}</div>
        <div class="domain-body">
          <strong>Пакетная база APT</strong>
          <span>Целостность репозиториев, dpkg и модулей ядра</span>
          <div class="domain-status-row ok">
            ${brandIcon('check', 13)} &nbsp; Блокировок нет
          </div>
        </div>
      </div>
    </div>

    ${canonBanner()}

    <!-- Issues List or Interactive Repair Center -->
    ${state.issues.length ? `
      <div class="section-title">
        <h2>Обнаруженные проблемы и рекомендации (${state.issues.length})</h2>
        <button class="btn btn-purple btn-small" data-action="agent-auto-repair">
          ${brandIcon('bolt', 14)} &nbsp; Исправить всё разом с ИИ
        </button>
      </div>
      <div class="issues-list">
        ${state.issues.map((issue) => `
          <article class="issue-card ${escapeHtml(issue.severity || 'warning')}">
            <div class="issue-marker">
              ${brandIcon(issue.severity === 'critical' ? 'error' : issue.severity === 'warning' ? 'alert' : 'check', 22)}
            </div>
            <div class="issue-body">
              <h3>${escapeHtml(issue.title)}</h3>
              <p>${escapeHtml(issue.description)}</p>
              <span class="issue-action-hint">Рекомендация: ${escapeHtml(issue.action)}</span>
            </div>
            <div class="issue-actions-wrap">
              <span class="issue-risk-tag">Риск: ${escapeHtml(issue.risk || 'Низкий')}</span>
              <button class="btn btn-purple btn-small" data-fix-issue="${escapeHtml(issue.id)}">
                ${brandIcon('bolt', 14)} &nbsp; Исправить с ИИ
              </button>
            </div>
          </article>
        `).join('')}
      </div>
    ` : `
      <div class="repair-interactive-card">
        <div class="repair-card-header">
          <div class="domain-icon">${brandIcon('shield', 24)}</div>
          <div>
            <h3>Комплекс автоматической диагностики и восстановления</h3>
            <p>Система готова к проведению глубокой проверки. Выберите требуемые направления для проверки и автоматического устранения неполадок:</p>
          </div>
        </div>

        <div class="repair-checklist-grid">
          <label class="repair-check-item">
            <input type="checkbox" checked id="check-repair-groups" />
            <span>Проверить и добавить пользователя в группу <b>lp</b> (устраняет зависание печати в Astra Linux)</span>
          </label>
          <label class="repair-check-item">
            <input type="checkbox" checked id="check-repair-fifo" />
            <span>Восстановить FIFO-буфер <code>/var/ccpd/fifo0</code> и правила udev для Canon LBP</span>
          </label>
          <label class="repair-check-item">
            <input type="checkbox" checked id="check-repair-cups" />
            <span>Очистить зависшие задания и перезапустить службы печати CUPS/CCPD</span>
          </label>
          <label class="repair-check-item">
            <input type="checkbox" checked id="check-repair-apt" />
            <span>Проверить целостность пакетов APT и исправить незавершённые установки (<code>dpkg --configure -a</code>)</span>
          </label>
          <label class="repair-check-item">
            <input type="checkbox" checked id="check-repair-usblp" />
            <span>Активировать модуль ядра <code>usblp</code> в <code>/etc/modules</code></span>
          </label>
          <label class="repair-check-item">
            <input type="checkbox" checked id="check-repair-ai" />
            <span>Передать системные факты в ИИ-Агент Qwen для выявления скрытых конфликтов</span>
          </label>
        </div>

        <div class="repair-actions-bar">
          <button class="btn btn-purple" data-action="diagnose" ${state.diagnosticsRunning ? 'disabled' : ''}>
            ${brandIcon('refresh', 16)} &nbsp; ${state.diagnosticsRunning ? 'Диагностика…' : 'Запустить диагностику'}
          </button>
          <button class="btn btn-primary" data-action="agent-auto-repair" ${state.diagnosticsRunning ? 'disabled' : ''}>
            ${brandIcon('bolt', 16)} &nbsp; Проверить и исправить с ИИ
          </button>
        </div>
      </div>
    `}

    ${state.ai ? `
      <div class="ai-card" style="margin-top: 24px;">
        <div class="ai-title">
          <span>${brandIcon('shield', 20)}</span>
          <div>
            <strong>Анализ Qwen AI</strong>
            <small>${state.ai.error ? 'Недоступен — показаны локальные правила' : 'Рекомендация на основе диагностических фактов'}</small>
          </div>
        </div>
        <div class="chat-markdown" style="margin-top: 14px;">
          ${formatMarkdown(state.ai.error ? 'Подключение к Qwen не настроено или временно недоступно. Локальная диагностика продолжает работать.' : state.ai.summary || 'Анализ завершён.')}
        </div>
        ${state.ai.recommendations?.length ? `
          <ul style="margin-top: 12px;">
            ${state.ai.recommendations.map((recommendation) => `<li>${formatMarkdown(typeof recommendation === 'string' ? recommendation : recommendation.title || recommendation.reason)}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    ` : ''}
  `;
}

function printersPage() {
  const printers = state.installedPrinters || [];
  const defaultPrinter = printers.find(p => p.isDefault) || printers[0];

  return `
    <div class="page-title">
      <div>
        <span class="eyebrow">ПЕЧАТЬ И ОБОРУДОВАНИЕ</span>
        <h1>Принтеры и печать</h1>
        <p>Управление установленными принтерами CUPS, мониторинг очередей и калибровка оборудования.</p>
      </div>
      <div class="page-title-actions">
        <button class="btn btn-secondary btn-small" data-action="refresh-printers">
          ${brandIcon('refresh', 16)} &nbsp; Обновить список
        </button>
        <button class="btn btn-secondary btn-small" data-action="clear-all-queues">
          ${brandIcon('delete_sweep', 16)} &nbsp; Очистить очереди
        </button>
      </div>
    </div>

    <!-- Branded Test Page Hero Card -->
    <div class="test-page-hero-card">
      <div class="test-page-hero-copy">
        <div class="card-label">ФИРМЕННАЯ КАЛИБРОВКА DRIVER HUB</div>
        <h2>Тестовая страница DRIVER HUB LINUX (biblioteka33.ru)</h2>
        <p>
          Фирменный калибровочный лист содержит векторный логотип <b>DRIVER HUB LINUX</b>, водяной знак <b>biblioteka33.ru</b>,
          градиентную шкалу плотности тонера (10%-100%), микросетку сведения линий, тест шрифтов разного кегля и телеметрию системы (Astra Linux, ядро, архитектура).
        </p>
        <div class="test-page-controls">
          ${printers.length ? `
            <select class="printer-select" id="test-page-printer-select">
              ${printers.map(p => `
                <option value="${escapeHtml(p.name)}" ${defaultPrinter?.name === p.name ? 'selected' : ''}>
                  ${escapeHtml(p.name)} ${p.isDefault ? '(По умолчанию)' : ''}
                </option>
              `).join('')}
            </select>
            <button class="btn btn-primary" id="btn-print-branded-page">
              ${brandIcon('printer', 18)} &nbsp; Напечатать фирменную страницу проверки
            </button>
          ` : `
            <div class="empty-printers-hint" style="color: var(--warning); display: flex; align-items: center; gap: 8px;">
              ${brandIcon('alert', 18)} &nbsp; В системе пока не найдено активных принтеров CUPS. Настройте принтер ниже или выполните установку драйвера.
            </div>
          `}
        </div>
      </div>
      <div class="test-page-preview-wrapper">
        <div class="test-page-sheet-preview">
          <div class="sheet-header">
            <span class="sheet-logo">DRIVER HUB LINUX</span>
            <span class="sheet-domain">biblioteka33.ru</span>
          </div>
          <div class="sheet-bars">
            <span style="opacity: 1.0"></span>
            <span style="opacity: 0.8"></span>
            <span style="opacity: 0.6"></span>
            <span style="opacity: 0.4"></span>
            <span style="opacity: 0.2"></span>
          </div>
          <div class="sheet-lines">
            <div class="sheet-grid-mock"></div>
            <div class="sheet-text-mock">
              <span>Lorem ipsum dolor sit amet</span>
              <span>Astra Linux Edition • CUPS Calibration</span>
              <span>A4 600 DPI • PostScript Level 3</span>
            </div>
          </div>
          <div class="sheet-footer">
            <span>Калибровочный тест</span>
            <span>✓ OK</span>
          </div>
        </div>
      </div>
    </div>

    ${canonBanner()}

    <div class="section-title" style="margin-top: 24px;">
      <h2>Установленные принтеры (${printers.length})</h2>
      <button class="btn btn-secondary btn-small" data-action="refresh-printers">
        ${brandIcon('refresh', 16)} &nbsp; Обновить
      </button>
    </div>

    <div class="printers-grid">
      ${printers.length ? printers.map(p => `
        <article class="printer-card ${p.isDefault ? 'is-default' : ''}">
          <div class="printer-card-head">
            <div class="printer-icon-wrap">
              ${brandIcon('printer', 24)}
            </div>
            <div class="printer-head-info">
              <div class="printer-title-row">
                <h3>${escapeHtml(p.name)}</h3>
                ${p.isDefault ? '<span class="default-badge">По умолчанию</span>' : ''}
              </div>
              <span class="printer-uri" title="${escapeHtml(p.uri || '')}">
                ${escapeHtml(p.uri || 'Локальный принтер CUPS')}
              </span>
            </div>
          </div>

          <div class="printer-card-status">
            <span class="status-badge ${p.status === 'ready' || p.status === 'idle' ? 'success' : p.status === 'printing' ? 'warning' : 'danger'}">
              <span class="status-dot ${p.status === 'ready' || p.status === 'idle' ? 'success' : p.status === 'printing' ? 'warning' : 'danger'}">${brandIcon(p.status === 'ready' || p.status === 'idle' ? 'check' : p.status === 'printing' ? 'alert' : 'error', 13)}</span>
              <div class="status-copy ${p.status === 'ready' || p.status === 'idle' ? 'success' : p.status === 'printing' ? 'warning' : 'danger'}">
                <strong>${escapeHtml(p.statusText || 'Готов к работе')}</strong>
                <span>${escapeHtml(p.rawStatus || 'Очередь активна')}</span>
              </div>
            </span>
          </div>

          <div class="printer-card-actions">
            <button class="btn btn-primary btn-small" data-print-test="${escapeHtml(p.name)}">
              ${brandIcon('printer', 16)} &nbsp; Пробная страница
            </button>
            <button class="btn btn-secondary btn-small" data-clear-queue="${escapeHtml(p.name)}">
              ${brandIcon('delete_sweep', 16)} &nbsp; Очистить задания
            </button>
          </div>
        </article>
      `).join('') : `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 40px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);">
          ${brandIcon('printer', 44, 'empty-icon')}
          <h3>Принтеры не найдены</h3>
          <p>В подсистеме CUPS пока не зарегистрировано ни одного принтера. Подключите принтер через USB или воспользуйтесь спец-комплексом Canon LBP выше.</p>
          <div style="margin-top: 14px; display: flex; gap: 10px;">
            <button class="btn btn-primary" data-action="install-canon">${brandIcon('printer', 16)} &nbsp; Настроить Canon LBP</button>
            <button class="btn btn-secondary" data-action="refresh-printers">${brandIcon('refresh', 16)} &nbsp; Обновить список</button>
          </div>
        </div>
      `}
    </div>
  `;
}

function agentPage() {
  const modelName = state.settings?.qwenModel || 'qwen/qwen3.8-max:free';
  const hasKey = Boolean(state.settings?.xkiroApiKey);
  const modelsList = state.freeModels.length ? state.freeModels : [
    { id: 'qwen/qwen3.8-max:free', name: 'Qwen 3.8 Max (Free) — Рекомендуется' },
    { id: 'qwen/qwen3-coder-plus:free', name: 'Qwen 3 Coder Plus (Free) — Для Linux команд' },
    { id: 'qwen/qwen3.7-max:free', name: 'Qwen 3.7 Max (Free)' },
    { id: 'qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus (Free)' },
    { id: 'qwen/qwen3.5-flash:free', name: 'Qwen 3.5 Flash (Free)' },
    { id: 'qwen/qwen3-max:free', name: 'Qwen 3 Max (Free)' }
  ];

  return `
    <div class="agent-shell">
      <div class="agent-header-card">
        <div class="agent-identity">
          <div class="agent-avatar">${brandIcon('cpu', 22)}</div>
          <div>
            <strong>Системный ИИ-Агент DriverHub</strong>
            <span>Автономное исправление ошибок оборудования, ядра Linux и Astra Linux</span>
          </div>
        </div>
        <div class="agent-header-controls">
          <div class="agent-model-switcher">
            <span class="switcher-label">Модель:</span>
            <select id="agent-model-select" class="agent-model-dropdown">
              ${modelsList.map((m) => `<option value="${escapeHtml(m.id)}" ${modelName === m.id ? 'selected' : ''}>${escapeHtml(m.name || m.id)}</option>`).join('')}
            </select>
          </div>
          <div class="agent-status-badge ${hasKey ? 'active' : 'local'}">
            <span class="agent-status-dot"></span>
            <span>${hasKey ? 'xkiro онлайн' : 'Локальный эксперт'}</span>
          </div>
        </div>
      </div>

      ${!hasKey ? `
        <div class="agent-key-banner">
          <span class="banner-icon">${brandIcon('shield', 22)}</span>
          <div class="banner-copy">
            <strong>Подключите xkiro API для активации нейросетевых моделей Qwen</strong>
            <p>Вставьте ваш API-ключ для расширенного анализа ядра, диагностики Astra Linux и устранения проблем печати Canon:</p>
          </div>
          <div class="banner-form">
            <input type="password" id="agent-quick-key" class="xkiro-input" placeholder="sk-xt-... или sk-xkiro-..." />
            <button class="btn btn-primary btn-small" id="btn-agent-quick-save">Сохранить</button>
          </div>
        </div>
      ` : ''}

      <div class="agent-messages-box" id="agent-chat-box">
        ${state.agentMessages.map((msg) => `
          <div class="chat-msg ${msg.role}">
            <div class="chat-avatar">${msg.role === 'user' ? 'Вы' : brandIcon('cpu', 16)}</div>
            <div class="chat-bubble">
              <div class="chat-markdown">${formatMarkdown(msg.content)}</div>
              ${msg.action ? `
                <div class="action-plan-card">
                  <div class="action-plan-head"><span>${brandIcon('shield', 16)}</span><b>${escapeHtml(msg.action.title)}</b></div>
                  <p>${escapeHtml(msg.action.description)}</p>
                  <button class="btn btn-purple action-plan-btn" data-execute-action="${escapeHtml(JSON.stringify(msg.action))}">${brandIcon('bolt', 14)} &nbsp; Применить исправление (требуются права root)</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
        ${state.agentRunning ? `<div class="chat-msg agent"><div class="chat-avatar">${brandIcon('cpu', 16)}</div><div class="chat-bubble"><span class="spinner"></span> ИИ-Агент анализирует систему и формирует план...</div></div>` : ''}
      </div>

      <div class="quick-prompts-bar">
        <button class="quick-prompt-chip" data-prompt="Принтер Canon LBP виден, но печать не идет в Astra Linux. Помоги исправить!">${brandIcon('printer', 14)} &nbsp; Принтер не печатает в Astra Linux (группа lp)</button>
        <button class="quick-prompt-chip" data-prompt="Настроить принтер Canon LBP2900 для Astra Linux">${brandIcon('printer', 14)} &nbsp; Настроить Canon LBP2900</button>
        <button class="quick-prompt-chip" data-prompt="Настроить принтер Canon LBP6000 для Astra Linux">${brandIcon('printer', 14)} &nbsp; Настроить Canon LBP6000</button>
        <button class="quick-prompt-chip" data-prompt="Проверить целостность пакетов APT и исправить сломанные зависимости">${brandIcon('package', 14)} &nbsp; Исправить зависимости APT</button>
        <button class="quick-prompt-chip" data-prompt="Провести полную диагностику системы и исправить найденные ошибки">${brandIcon('shield', 14)} &nbsp; Найти и исправить все ошибки</button>
      </div>

      <div class="agent-input-row">
        <input class="agent-input" id="agent-input-text" placeholder="Опишите проблему или команду (например: 'почему не печатает Canon LBP2900?')..." />
        <button class="btn btn-purple agent-send-btn" id="btn-agent-send" ${state.agentRunning ? 'disabled' : ''}>${brandIcon('send', 16)} &nbsp; Отправить</button>
      </div>
    </div>
  `;
}

function logsPage() {
  return `<div class="page-title"><div><span class="eyebrow">АУДИТ ОПЕРАЦИЙ</span><h1>Журнал</h1><p>История сканирований, диагностики и подтверждённых установок.</p></div><button class="btn btn-secondary" data-action="clear-logs">${brandIcon('delete_sweep', 16)} &nbsp; Очистить журнал</button></div><div class="log-table"><div class="table-head"><span>Дата и время</span><span>Операция</span><span>Результат</span><span>Описание</span></div>${state.logs.length ? state.logs.map((log) => `<div class="log-row"><span>${new Date(log.timestamp).toLocaleString('ru-RU')}</span><b>${escapeHtml({ scan: 'Сканирование', diagnostics: 'Диагностика', install: 'Установка', repair: 'Исправление' }[log.type] || log.type)}</b><span class="log-status ${log.status}">${escapeHtml(log.status === 'success' ? 'Успешно' : log.status === 'error' ? 'Ошибка' : 'В процессе')}</span><span>${escapeHtml(log.summary || '')}</span></div>`).join('') : '<div class="empty-row">Журнал пока пуст</div>'}</div>`;
}

function settingsPage() {
  const info = state.system || {};
  const apiKey = state.settings?.xkiroApiKey || '';
  const baseUrl = state.settings?.xkiroBaseUrl || 'https://api.xkiro.com/v1';
  const selectedModel = state.settings?.qwenModel || 'qwen/qwen3.8-max:free';

  const modelsList = state.freeModels.length ? state.freeModels : [
    { id: 'qwen/qwen3.8-max:free', name: 'Qwen 3.8 Max (Free) — Рекомендуется' },
    { id: 'qwen/qwen3-coder-plus:free', name: 'Qwen 3 Coder Plus (Free) — Для Linux команд' },
    { id: 'qwen/qwen3.7-max:free', name: 'Qwen 3.7 Max (Free)' },
    { id: 'qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus (Free)' },
    { id: 'qwen/qwen3.5-flash:free', name: 'Qwen 3.5 Flash (Free)' },
    { id: 'qwen/qwen3-max:free', name: 'Qwen 3 Max (Free)' }
  ];

  return `
    <div class="page-title">
      <div>
        <span class="eyebrow">КОНФИГУРАЦИЯ</span>
        <h1>Настройки</h1>
        <p>Параметры проверки системы, интеграция с xkiro API и выбор бесплатных моделей Qwen.</p>
      </div>
    </div>
    <div class="settings-grid">
      <section class="settings-card">
        <h2>Система</h2>
        <div class="system-info">
          <span>Дистрибутив</span><b>${escapeHtml(info.distribution || 'Определяется…')}</b>
          <span>Ядро Linux</span><b>${escapeHtml(info.kernel || '—')}</b>
          <span>Архитектура</span><b>${escapeHtml(info.architecture || '—')}</b>
          <span>Имя компьютера</span><b>${escapeHtml(info.hostname || '—')}</b>
          <span>Группа печати lp</span><b style="color: ${info.userInLpGroup ? 'var(--green)' : 'var(--warning)'};">${info.userInLpGroup ? 'Включён в lp (печать разрешена) ✓' : 'Не в группе lp (требуется для Canon) ⚠'}</b>
        </div>
      </section>

      <section class="settings-card">
        <h2>Поведение</h2>
        <label class="setting-line">
          <span><b>Проверять при запуске</b><small>Автоматически сканировать устройства</small></span>
          <input type="checkbox" class="toggle" data-setting="autoScan" ${state.settings?.autoScan !== false ? 'checked' : ''} />
        </label>
        <label class="setting-line">
          <span><b>Уведомления</b><small>Показывать результаты операций</small></span>
          <input type="checkbox" class="toggle" data-setting="notifications" ${state.settings?.notifications !== false ? 'checked' : ''} />
        </label>
        <label class="setting-line">
          <span><b>Отправка диагностики в AI</b><small>Анализ через Qwen AI</small></span>
          <input type="checkbox" class="toggle" data-setting="sendDiagnostics" ${state.settings?.sendDiagnostics ? 'checked' : ''} />
        </label>
      </section>

      <section class="settings-card ai-settings">
        <h2>Интеграция с xkiro API и модели Qwen</h2>
        <p>Вставьте ваш API-ключ от xkiro для активации нейросетевого ассистента. Вы можете выбрать любую из доступных бесплатных моделей семейства Qwen.</p>
        
        <div style="display: grid; gap: 14px; margin-top: 14px;">
          <div>
            <label style="display: block; font-size: 13px; color: var(--muted); margin-bottom: 5px;">Ключ API xkiro:</label>
            <div class="xkiro-input-wrap">
              <input type="${state.showApiKey ? 'text' : 'password'}" class="xkiro-input" id="xkiro-api-key-input" value="${escapeHtml(apiKey)}" placeholder="sk-xkiro-..." autocomplete="off" />
              <button class="btn-toggle-eye" id="btn-toggle-eye" type="button">${state.showApiKey ? 'Скрыть' : 'Показать'}</button>
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 13px; color: var(--muted); margin-bottom: 5px;">Базовый URL:</label>
            <input type="text" class="xkiro-input" id="xkiro-base-url-input" value="${escapeHtml(baseUrl)}" style="width: 100%;" />
          </div>

          <div>
            <label style="display: block; font-size: 13px; color: var(--muted); margin-bottom: 5px;">Выбор бесплатной модели Qwen:</label>
            <select class="model-dropdown" id="qwen-model-select">
              ${modelsList.map((m) => `<option value="${escapeHtml(m.id)}" ${selectedModel === m.id ? 'selected' : ''}>${escapeHtml(m.name || m.id)}</option>`).join('')}
              <option value="custom" ${!modelsList.some(m => m.id === selectedModel) ? 'selected' : ''}>Произвольная модель...</option>
            </select>
          </div>

          <div class="settings-actions-row">
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="btn btn-primary" id="btn-save-xkiro" type="button">${brandIcon('check', 14)} &nbsp; Сохранить настройки</button>
              <button class="btn btn-secondary" id="btn-test-xkiro" type="button">${brandIcon('refresh', 14)} &nbsp; Проверить соединение</button>
            </div>
            <div id="test-status-area" class="status-inline-container">
              ${state.testStatus ? `<span class="test-status-badge ${state.testStatus.success ? 'success' : 'error'}">${escapeHtml(state.testStatus.message)}</span>` : ''}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function render() {
  renderNav();
  const pages = {
    home: homePage,
    search: searchPage,
    install: installPage,
    printers: printersPage,
    repair: repairPage,
    agent: agentPage,
    logs: logsPage,
    settings: settingsPage
  };
  el('#app').innerHTML = (pages[state.page] || homePage)();
  bindActions();
  renderProgressModal();
}

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span>${escapeHtml(message)}`;
  el('#toast-region')?.appendChild(node);
  setTimeout(() => node.remove(), 4300);
}

async function scan() {
  if (state.scanning) return;
  state.scanning = true;
  render();
  try {
    const result = await window.driverHub.devices.scan();
    state.devices = result.devices;
    state.demo = result.demo;
    if (result.rebootRequired || result.devices.some(d => d.rebootRequired)) {
      state.rebootRequired = true;
    }
    toast(result.note || `Обнаружено устройств: ${result.devices.length}`, result.demo ? 'info' : 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.scanning = false;
    render();
  }
}

async function diagnose() {
  if (state.diagnosticsRunning) return;
  state.diagnosticsRunning = true;
  toast('Выполняются безопасные проверки…');
  render();
  try {
    const result = await window.driverHub.diagnostics.run({ useAI: state.settings?.sendDiagnostics === true });
    state.devices = result.devices;
    state.issues = result.issues;
    state.system = result.info;
    state.ai = result.ai;
    state.demo = result.demo;
    state.page = state.page === 'home' ? 'home' : 'repair';
    toast('Диагностика завершена', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.diagnosticsRunning = false;
    render();
  }
}

function startPackageInstall(packageName, deviceName) {
  if (!packageName) return;
  const isPrinter = /cjet|canon|cups|foo2zjs|printer/i.test(packageName);
  activeProgress = {
    active: true,
    title: `Скачивание и установка: ${packageName}`,
    packageName,
    deviceName,
    isPrinter,
    printerName: isPrinter ? (state.installedPrinters?.[0]?.name || 'Canon-Printer') : '',
    percent: 5,
    stage: 'prepare',
    detail: `Подключение к репозиториям и скачивание пакета ${packageName}...`,
    logs: [`Запрос установки ${packageName} (${deviceName || 'устройство'})`],
    bytesDownloaded: 0,
    bytesTotal: 0,
    speed: '',
    eta: '',
    rebootRequired: false
  };
  renderProgressModal();

  window.driverHub.drivers.install({ packageName })
    .then((result) => {
      const needReboot = Boolean(result.rebootRequired || /nvidia|firmware|linux|kernel|iwlwifi/i.test(packageName));
      activeProgress.percent = 100;
      activeProgress.stage = 'completed';
      activeProgress.rebootRequired = needReboot;
      if (needReboot) {
        state.rebootRequired = true;
        state.rebootDetails = { packageName, deviceName };
      }
      activeProgress.detail = needReboot
        ? 'Пакет успешно установлен. Внимание: требуется перезагрузка системы для загрузки модуля ядра.'
        : `Драйвер ${packageName} успешно скачан и установлен!`;
      renderProgressModal();
      toast(needReboot ? 'Установка завершена. Требуется перезагрузка системы.' : 'Установка завершена успешно', needReboot ? 'info' : 'success');
    })
    .catch((err) => {
      activeProgress.stage = 'error';
      activeProgress.detail = `Ошибка: ${err.message}`;
      activeProgress.logs.push(`ОШИБКА: ${err.message}`);
      renderProgressModal();
      toast(err.message, 'error');
    });
}

function startCanonInstall(modelKey) {
  const model = modelKey || state.canonSelectedModel || 'LBP2900';
  const printerName = `Canon_${model}`;
  activeProgress = {
    active: true,
    title: `Настройка Canon ${model} (Astra Linux Suite)`,
    packageName: 'canon-lbp-suite',
    isPrinter: true,
    printerName,
    percent: 5,
    stage: 'prepare',
    detail: `Подготовка к загрузке модулей и настройке очереди CUPS для Canon ${model}...`,
    logs: [`Старт процедуры настройки Canon ${model}`],
    bytesDownloaded: 0,
    bytesTotal: 0,
    speed: '',
    eta: ''
  };
  renderProgressModal();

  window.driverHub.drivers.installCanon({ modelKey: model, printerName })
    .then((res) => {
      activeProgress.percent = 100;
      activeProgress.stage = 'completed';
      activeProgress.detail = `Принтер Canon ${model} успешно зарегистрирован в CUPS и готов к работе!`;
      renderProgressModal();
      toast(`Canon ${model} успешно настроен!`, 'success');
    })
    .catch((err) => {
      activeProgress.stage = 'error';
      activeProgress.detail = `Ошибка настройки: ${err.message}`;
      activeProgress.logs.push(`ОШИБКА: ${err.message}`);
      renderProgressModal();
      toast(err.message, 'error');
    });
}

function startAgentAction(action) {
  if (!action) return;
  activeProgress = {
    active: true,
    title: action.title || 'ИИ-Исправление системы',
    percent: 10,
    stage: 'prepare',
    detail: 'Выполнение утвержденного плана от ИИ-Агента...',
    logs: [`Старт действия: ${action.title}`]
  };
  renderProgressModal();

  window.driverHub.agent.executeAction(action)
    .then(() => {
      activeProgress.percent = 100;
      activeProgress.stage = 'completed';
      activeProgress.detail = 'Исправление успешно применено!';
      renderProgressModal();
      state.agentMessages.push({
        role: 'agent',
        content: `✓ Действие "${action.title}" успешно выполнено! Оборудование и конфигурация обновлены.`
      });
      toast('Действие успешно выполнено', 'success');
    })
    .catch((err) => {
      activeProgress.stage = 'error';
      activeProgress.detail = `Ошибка выполнения: ${err.message}`;
      activeProgress.logs.push(`ОШИБКА: ${err.message}`);
      renderProgressModal();
      toast(err.message, 'error');
    });
}

function showInstall(packageName, deviceName) {
  if (!packageName) {
    toast('Для этого устройства безопасный пакет пока не найден', 'info');
    return;
  }
  if (packageName === 'canon-lbp-suite') {
    startCanonInstall(state.canonSelectedModel);
    return;
  }

  el('#modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <button class="modal-close" data-close-modal>×</button>
        <span class="modal-symbol">${brandIcon('download', 36)}</span>
        <h2>Установить драйвер?</h2>
        <p>Для устройства <b>${escapeHtml(deviceName)}</b> будет выполнен реальный процесс скачивания и установки:</p>
        <div class="package-preview">
          <code>${escapeHtml(packageName)}</code>
          <span>загрузка из официальных репозиториев Linux с реальным индикатором прогресса</span>
        </div>
        <div class="modal-warning">Операция выполняется безопасно через Polkit с проверкой контрольных сумм и интеграцией в ядро системы.</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-close-modal>Отмена</button>
          <button class="btn btn-success" data-confirm-install="${escapeHtml(packageName)}" data-confirm-device="${escapeHtml(deviceName)}">
            ${brandIcon('download', 14)} &nbsp; Скачать и установить
          </button>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  el('#modal-backdrop')?.addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  el('[data-confirm-install]')?.addEventListener('click', (e) => {
    const pkg = e.currentTarget.dataset.confirmInstall;
    const dev = e.currentTarget.dataset.confirmDevice;
    closeModal();
    startPackageInstall(pkg, dev);
  });
}

function closeModal() {
  el('#modal-root').innerHTML = '';
}

async function sendAgentMessage(text) {
  const content = (text || el('#agent-input-text')?.value || '').trim();
  if (!content || state.agentRunning) return;

  state.agentMessages.push({ role: 'user', content });
  state.agentRunning = true;
  render();

  const chatBox = el('#agent-chat-box');
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const history = state.agentMessages.filter(m => m.role === 'user' || m.role === 'agent');
    const result = await window.driverHub.agent.chat({
      message: content,
      history
    });

    state.agentMessages.push({
      role: 'agent',
      content: result.text,
      action: result.action
    });
  } catch (err) {
    state.agentMessages.push({
      role: 'agent',
      content: `Произошла ошибка при обращении к ИИ-агенту: ${err.message}`
    });
  } finally {
    state.agentRunning = false;
    render();
    const chatBoxEnd = el('#agent-chat-box');
    if (chatBoxEnd) chatBoxEnd.scrollTop = chatBoxEnd.scrollHeight;
  }
}

async function printTestPage(printerName) {
  if (!printerName) {
    toast('Выберите принтер для печати', 'error');
    return;
  }
  toast(`Отправка фирменной тестовой страницы DRIVER HUB LINUX (biblioteka33.ru) на "${printerName}"...`, 'info');
  try {
    const res = await window.driverHub.printers.printTestPage({ printerName });
    toast(res.message || `Фирменная тестовая страница успешно отправлена на печать (${printerName})!`, 'success');
    await loadPrinters();
  } catch (err) {
    toast(`Ошибка тестовой печати: ${err.message}`, 'error');
  }
}

async function clearQueue(printerName) {
  try {
    await window.driverHub.printers.clearQueue({ printerName });
    toast(printerName ? `Очередь принтера "${printerName}" очищена` : 'Все очереди печати очищены', 'success');
    await loadPrinters();
  } catch (err) {
    toast(`Ошибка очистки очереди: ${err.message}`, 'error');
  }
}

async function loadPrinters(showToast = false) {
  try {
    const list = await window.driverHub?.printers?.list?.();
    if (Array.isArray(list)) {
      state.installedPrinters = list;
    }
    if (showToast) {
      toast(`Найдено принтеров: ${state.installedPrinters.length}`, 'info');
    }
    if (state.page === 'printers') {
      render();
    }
  } catch (err) {
    console.error('Ошибка загрузки списка принтеров:', err);
  }
}

function bindActions() {
  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
    state.page = button.dataset.page;
    if (state.page === 'printers') {
      loadPrinters();
    }
    render();
  }));

  document.querySelectorAll('[data-window]').forEach((button) => button.addEventListener('click', () => {
    window.driverHub.window[button.dataset.window === 'maximize' ? 'toggleMaximize' : button.dataset.window]();
  }));

  document.querySelectorAll('[data-action="scan"]').forEach((button) => button.addEventListener('click', scan));
  document.querySelectorAll('[data-action="diagnose"]').forEach((button) => button.addEventListener('click', diagnose));
  document.querySelectorAll('[data-action="agent-auto-repair"]').forEach((button) => button.addEventListener('click', () => {
    state.page = 'agent';
    render();
    sendAgentMessage('Проведи полную системную диагностику и предложи план исправления обнаруженных неполадок.');
  }));

  document.querySelectorAll('[data-action="refresh-printers"]').forEach((button) => button.addEventListener('click', () => {
    loadPrinters(true);
  }));

  document.querySelectorAll('[data-action="clear-all-queues"]').forEach((button) => button.addEventListener('click', () => {
    clearQueue();
  }));

  el('#btn-print-branded-page')?.addEventListener('click', () => {
    const sel = el('#test-page-printer-select');
    printTestPage(sel?.value);
  });

  document.querySelectorAll('[data-print-test]').forEach((button) => button.addEventListener('click', () => {
    printTestPage(button.dataset.printTest);
  }));

  document.querySelectorAll('[data-clear-queue]').forEach((button) => button.addEventListener('click', () => {
    clearQueue(button.dataset.clearQueue);
  }));

  document.querySelectorAll('[data-action="install-canon"]').forEach((button) => button.addEventListener('click', () => {
    startCanonInstall(state.canonSelectedModel);
  }));

  const canonSelect = el('#canon-model-select');
  if (canonSelect) {
    canonSelect.addEventListener('change', (e) => {
      state.canonSelectedModel = e.target.value;
    });
  }

  document.querySelectorAll('[data-action="reboot-system"]').forEach((button) => button.addEventListener('click', () => {
    const pkg = button.dataset.package || state.rebootDetails?.packageName || 'Драйвер Linux';
    const dev = button.dataset.device || state.rebootDetails?.deviceName || 'Оборудование';
    renderRebootModal(pkg, dev);
  }));

  document.querySelectorAll('[data-install]').forEach((button) => button.addEventListener('click', () => {
    showInstall(button.dataset.install, button.dataset.device);
  }));

  document.querySelectorAll('[data-reinstall]').forEach((button) => button.addEventListener('click', () => {
    const devName = button.dataset.reinstall || '';
    const device = state.devices.find(d => d.name === devName);
    let pkg = device?.recommendation?.name;
    if (!pkg) {
      if (/canon|printer|lbp/i.test(devName)) pkg = 'printer-driver-cjet';
      else if (/bluetooth|bluez/i.test(devName)) pkg = 'bluez';
      else if (/wifi|wireless|intel/i.test(devName)) pkg = 'firmware-iwlwifi';
      else if (/nvidia/i.test(devName)) pkg = 'nvidia-driver';
      else pkg = 'linux-firmware';
    }
    showInstall(pkg, devName);
  }));

  el('#btn-install-all-recommended')?.addEventListener('click', async () => {
    const candidates = state.devices.filter((device) => device.recommendation);
    if (!candidates.length) return;
    for (const dev of candidates) {
      if (dev.recommendation?.name === 'canon-lbp-suite') {
        startCanonInstall(state.canonSelectedModel);
        break;
      } else if (dev.recommendation?.name) {
        startPackageInstall(dev.recommendation.name, dev.name);
        break;
      }
    }
  });

  document.querySelectorAll('[data-fix-issue]').forEach((button) => button.addEventListener('click', () => {
    const issueId = button.dataset.fixIssue;
    state.page = 'agent';
    render();
    if (issueId.includes('canon-astra-lp-group')) {
      sendAgentMessage('У меня принтер Canon LBP в Astra Linux. Задания отправляются в очередь, но печать не идет. Добавь пользователя в группу lp и исправь права.');
    } else if (issueId.includes('canon')) {
      sendAgentMessage('У меня принтер Canon LBP. Помоги настроить модуль usblp, службы и очередь печати в Astra Linux.');
    } else {
      sendAgentMessage(`Исправь проблему "${issueId}" в системе.`);
    }
  }));

  document.querySelectorAll('[data-execute-action]').forEach((button) => button.addEventListener('click', () => {
    try {
      const action = JSON.parse(button.dataset.executeAction);
      startAgentAction(action);
    } catch (e) {
      toast('Некорректный план действия', 'error');
    }
  }));

  // Agent Chat Controls
  el('#btn-agent-send')?.addEventListener('click', () => sendAgentMessage());
  el('#agent-input-text')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendAgentMessage();
  });

  // Быстрое переключение модели прямо из шапки чата ИИ-Агента
  el('#agent-model-select')?.addEventListener('change', async (e) => {
    const val = e.target.value;
    state.settings.qwenModel = val;
    await window.driverHub?.settings?.save?.(state.settings).catch(() => {});
    toast(`Выбрана модель: ${val}`, 'info');
    render();
  });

  // Быстрое сохранение ключа xkiro прямо из баннера ИИ-Агента
  el('#btn-agent-quick-save')?.addEventListener('click', async () => {
    const input = el('#agent-quick-key');
    const key = (input?.value || '').trim();
    if (!key) {
      toast('Пожалуйста, введите ключ API xkiro', 'error');
      return;
    }
    state.settings.xkiroApiKey = key;
    try {
      await window.driverHub?.settings?.save?.(state.settings);
      state.system = await window.driverHub.system.info();
      toast('Ключ API xkiro сохранен! Нейросетевой режим включен.', 'success');
      render();
    } catch (err) {
      toast(`Ошибка сохранения ключа: ${err.message}`, 'error');
    }
  });

  el('#agent-quick-key')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('#btn-agent-quick-save')?.click();
  });

  document.querySelectorAll('[data-prompt]').forEach((chip) => chip.addEventListener('click', () => {
    sendAgentMessage(chip.dataset.prompt);
  }));

  // Settings Controls: Live Sync & Non-destructive Updates
  const apiKeyInput = el('#xkiro-api-key-input');
  if (apiKeyInput) {
    apiKeyInput.addEventListener('input', (e) => {
      state.settings.xkiroApiKey = e.target.value.trim();
    });
    apiKeyInput.addEventListener('blur', async (e) => {
      state.settings.xkiroApiKey = e.target.value.trim();
      await window.driverHub?.settings?.save?.(state.settings).catch(() => {});
    });
    apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el('#btn-save-xkiro')?.click();
    });
  }

  const baseUrlInput = el('#xkiro-base-url-input');
  if (baseUrlInput) {
    baseUrlInput.addEventListener('input', (e) => {
      state.settings.xkiroBaseUrl = e.target.value.trim();
    });
    baseUrlInput.addEventListener('blur', async (e) => {
      state.settings.xkiroBaseUrl = e.target.value.trim();
      await window.driverHub?.settings?.save?.(state.settings).catch(() => {});
    });
  }

  const modelDropdown = el('#qwen-model-select');
  if (modelDropdown) {
    modelDropdown.addEventListener('change', async (e) => {
      let val = e.target.value;
      if (val === 'custom') {
        const customInput = prompt('Введите имя модели:', state.settings.qwenModel);
        if (customInput) val = customInput.trim();
      }
      state.settings.qwenModel = val;
      await window.driverHub?.settings?.save?.(state.settings).catch(() => {});
      toast(`Выбрана модель Qwen: ${val}`, 'info');
    });
  }

  el('#btn-toggle-eye')?.addEventListener('click', () => {
    state.showApiKey = !state.showApiKey;
    const input = el('#xkiro-api-key-input');
    const btn = el('#btn-toggle-eye');
    if (input) input.type = state.showApiKey ? 'text' : 'password';
    if (btn) btn.textContent = state.showApiKey ? 'Скрыть' : 'Показать';
  });

  el('#btn-save-xkiro')?.addEventListener('click', async () => {
    const key = (el('#xkiro-api-key-input')?.value || '').trim();
    const baseUrl = (el('#xkiro-base-url-input')?.value || 'https://api.xkiro.com/v1').trim();
    let model = el('#qwen-model-select')?.value || 'qwen/qwen3.8-max:free';

    state.settings.xkiroApiKey = key;
    state.settings.xkiroBaseUrl = baseUrl;
    state.settings.qwenModel = model;

    const statusArea = el('#test-status-area');

    try {
      const saved = await window.driverHub.settings.save(state.settings);
      if (saved) state.settings = { ...DEFAULT_CLIENT_SETTINGS, ...saved };
      state.system = await window.driverHub.system.info();
      if (statusArea) {
        statusArea.innerHTML = `<span class="test-status-badge success">✓ Настройки xkiro и модель Qwen успешно сохранены в ~/.config/driverhub/settings.json</span>`;
      }
      toast('Настройки xkiro успешно сохранены', 'success');
    } catch (err) {
      if (statusArea) {
        statusArea.innerHTML = `<span class="test-status-badge error">✕ Ошибка сохранения: ${escapeHtml(err.message)}</span>`;
      }
      toast(`Ошибка сохранения: ${err.message}`, 'error');
    }
  });

  el('#btn-test-xkiro')?.addEventListener('click', async () => {
    const apiKey = (el('#xkiro-api-key-input')?.value || state.settings.xkiroApiKey || '').trim();
    const baseUrl = (el('#xkiro-base-url-input')?.value || state.settings.xkiroBaseUrl || 'https://api.xkiro.com/v1').trim();
    const model = el('#qwen-model-select')?.value || state.settings.qwenModel || 'qwen/qwen3.8-max:free';

    const testBtn = el('#btn-test-xkiro');
    const statusArea = el('#test-status-area');

    if (!apiKey) {
      if (statusArea) statusArea.innerHTML = '<span class="test-status-badge error">✕ Введите ключ API xkiro перед проверкой</span>';
      toast('Ключ API xkiro не указан', 'error');
      return;
    }

    // Сохраняем значения сразу
    state.settings.xkiroApiKey = apiKey;
    state.settings.xkiroBaseUrl = baseUrl;
    state.settings.qwenModel = model;
    await window.driverHub?.settings?.save?.(state.settings).catch(() => {});

    if (testBtn) {
      testBtn.disabled = true;
      testBtn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> &nbsp; Проверка подключения...';
    }
    if (statusArea) {
      statusArea.innerHTML = `<span class="test-status-badge info"><span class="spinner" style="width: 12px; height: 12px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Запрос к xkiro API (модель: ${escapeHtml(model)})...</span>`;
    }

    try {
      const res = await window.driverHub.ai.testConnection({ apiKey, baseUrl, model });
      state.testStatus = {
        success: true,
        message: `✓ Подключение успешно! Модель ${res.model} готова к работе.`
      };
      if (statusArea) {
        statusArea.innerHTML = `<span class="test-status-badge success">✓ Подключение успешно подтверждено! Ответ модели ${escapeHtml(res.model)} получен.</span>`;
      }
      toast('Подключение к xkiro подтверждено', 'success');
    } catch (err) {
      state.testStatus = {
        success: false,
        message: `✕ Ошибка: ${err.message}`
      };
      if (statusArea) {
        statusArea.innerHTML = `<span class="test-status-badge error">✕ Ошибка подключения: ${escapeHtml(err.message)}</span>`;
      }
      toast(err.message, 'error');
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = 'Проверить соединение';
      }
    }
  });

  const searchInput = el('#driver-search');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      state.query = event.target.value;
      const resultsContainer = el('.driver-results');
      if (resultsContainer) {
        const filtered = state.devices.filter((device) =>
          `${device.name} ${device.category} ${device.driver || ''}`.toLowerCase().includes(state.query.toLowerCase())
        );
        resultsContainer.innerHTML = renderDriverResults(filtered);
        resultsContainer.querySelectorAll('[data-install]').forEach((button) =>
          button.addEventListener('click', () => showInstall(button.dataset.install, button.dataset.device))
        );
        resultsContainer.querySelectorAll('[data-action="install-canon"]').forEach((button) =>
          button.addEventListener('click', () => startCanonInstall(state.canonSelectedModel))
        );
      }
    });
  }

  document.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('change', async () => {
    const key = input.dataset.setting;
    if (!state.settings) {
      state.settings = { ...DEFAULT_CLIENT_SETTINGS };
    }
    const previous = state.settings[key];
    state.settings[key] = input.checked;
    input.disabled = true;
    try {
      const saved = await window.driverHub?.settings?.save?.(state.settings);
      if (saved) {
        state.settings = { ...DEFAULT_CLIENT_SETTINGS, ...saved };
      }
      toast('Настройка сохранена', 'success');
    } catch (error) {
      state.settings[key] = previous;
      input.checked = Boolean(previous);
      toast(`Не удалось сохранить: ${error.message}`, 'error');
    } finally {
      input.disabled = false;
    }
  }));

  el('[data-action="clear-logs"]')?.addEventListener('click', async () => {
    await window.driverHub.logs.clear();
    state.logs = [];
    render();
    toast('Журнал очищен', 'success');
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

async function init() {
  try {
    const [systemRes, settingsRes, logsRes, modelsRes, printersRes] = await Promise.allSettled([
      window.driverHub?.system?.info?.(),
      window.driverHub?.settings?.get?.(),
      window.driverHub?.logs?.list?.(),
      window.driverHub?.ai?.getFreeModels?.(),
      window.driverHub?.printers?.list?.()
    ]);

    if (systemRes.status === 'fulfilled' && systemRes.value) {
      state.system = systemRes.value;
      if (systemRes.value.rebootRequired) {
        state.rebootRequired = true;
      }
    }
    if (settingsRes.status === 'fulfilled' && settingsRes.value) {
      state.settings = { ...DEFAULT_CLIENT_SETTINGS, ...settingsRes.value };
    }
    if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) {
      state.logs = logsRes.value;
    }
    if (modelsRes.status === 'fulfilled' && Array.isArray(modelsRes.value)) {
      state.freeModels = modelsRes.value;
    }
    if (printersRes.status === 'fulfilled' && Array.isArray(printersRes.value)) {
      state.installedPrinters = printersRes.value;
    }

    // Слушатель прогресса скачивания и установки
    window.driverHub?.drivers?.onProgress?.((data) => {
      if (data) {
        activeProgress.stage = data.stage || activeProgress.stage;
        activeProgress.percent = data.percent !== undefined ? data.percent : activeProgress.percent;
        activeProgress.detail = data.detail || activeProgress.detail;
        if (data.bytesDownloaded !== undefined) activeProgress.bytesDownloaded = data.bytesDownloaded;
        if (data.bytesTotal !== undefined) activeProgress.bytesTotal = data.bytesTotal;
        if (data.speed !== undefined) activeProgress.speed = data.speed;
        if (data.eta !== undefined) activeProgress.eta = data.eta;
        if (data.log) activeProgress.logs.push(data.log);
        renderProgressModal();
      }
    });

  } catch (error) {
    toast(error.message, 'error');
  }
  render();
  if (state.settings?.autoScan !== false) scan();
}

init();
