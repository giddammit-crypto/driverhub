const DEFAULT_CLIENT_SETTINGS = {
  autoScan: true,
  aiEnabled: true,
  sendDiagnostics: false,
  notifications: true
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
  query: ''
};

const navItems = [
  ['home', '⌂', 'Главная'], ['search', '⌕', 'Поиск драйверов'], ['install', '⇩', 'Установка'],
  ['repair', '⚙', 'Исправление ошибок'], ['logs', '▤', 'Журнал'], ['settings', '⚙', 'Настройки']
];

const el = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const statusClass = (status) => ({ ok: 'success', recommended: 'warning', problem: 'danger', unknown: 'muted' }[status] || 'muted');
const statusLabel = (status, text) => text || ({ ok: 'Работает корректно', recommended: 'Рекомендуется установить драйвер', problem: 'Обнаружены проблемы', unknown: 'Неизвестно' }[status] || 'Неизвестно');

function renderNav() {
  el('#navigation').innerHTML = navItems.map(([id, icon, label]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');
}

function deviceRow(device) {
  const packageName = device.recommendation?.name;
  const action = device.status === 'problem' || device.status === 'recommended'
    ? `<button class="btn btn-${device.status === 'problem' ? 'purple' : 'success'} btn-small" data-install="${escapeHtml(packageName || '')}" data-device="${escapeHtml(device.name)}">${device.status === 'problem' ? 'Исправить' : 'Установить'}</button>`
    : `<button class="btn btn-secondary btn-small" data-reinstall="${escapeHtml(device.name)}">Переустановить</button>`;
  return `<div class="device-row"><div class="device-name"><span class="device-icon icon-${device.category}">${escapeHtml(device.icon || '◈')}</span><div><strong>${escapeHtml(device.name)}</strong><span>${escapeHtml(device.detail || 'Устройство')}</span></div></div><div class="driver-cell"><strong>${escapeHtml(device.driver || 'не определён')}</strong><span>${escapeHtml(device.version || '—')}</span></div><div class="status-cell"><span class="status-dot ${statusClass(device.status)}">${device.status === 'problem' ? '!' : device.status === 'warning' ? '!' : '✓'}</span><div class="status-copy ${statusClass(device.status)}"><strong>${escapeHtml(statusLabel(device.status, device.statusText))}</strong><span>${escapeHtml(device.recommendation?.reason || (device.status === 'ok' ? 'Основной модуль загружен' : device.source || 'Проверьте состояние'))}</span></div></div><div class="device-action">${action}<button class="more-btn" aria-label="Дополнительные действия">⌄</button></div></div>`;
}

function systemStatus() {
  const critical = state.issues.filter((issue) => issue.severity === 'critical').length;
  const warnings = state.issues.filter((issue) => issue.severity === 'warning').length;
  if (critical) return { icon: '!', title: 'Требуется внимание', text: `${critical} критическая проблема обнаружена`, className: 'danger' };
  if (warnings) return { icon: '!', title: 'Есть рекомендации', text: `${warnings} проверки требуют внимания`, className: 'warning' };
  return { icon: '✓', title: 'Система в порядке', text: 'Критических ошибок не обнаружено', className: 'success' };
}

function homePage() {
  const system = systemStatus();
  return `<div class="page-header hero-header"><div class="hero-icon">▣</div><div class="hero-copy"><h1>DriverHub</h1><p>Поиск, установка и настройка драйверов для Linux</p><span>Автоматически найдёт подходящие драйверы, установит их и поможет<br class="desktop-only" /> исправить ошибки в случае проблем.</span></div><div class="system-card ${system.className}"><div class="system-card-top"><span class="big-status">${system.icon}</span><div><strong>${system.title}</strong><span>${system.text}</span><span>${state.devices.length || '—'} основных устройств проверено</span></div></div><button class="btn btn-primary" data-action="diagnose" ${state.diagnosticsRunning ? 'disabled' : ''}>↻ &nbsp; ${state.diagnosticsRunning ? 'Проверка…' : 'Проверить сейчас'}</button></div></div>
  <div class="quick-grid"><button class="quick-card blue" data-page="search"><span class="quick-icon">⌕</span><div><strong>Поиск драйверов</strong><span>Анализ устройств и поиск<br />совместимых драйверов</span></div></button><button class="quick-card green" data-page="install"><span class="quick-icon">⇩</span><div><strong>Установка</strong><span>Автоматическая установка<br />драйверов в систему</span></div></button><button class="quick-card purple" data-page="repair"><span class="quick-icon">⚒</span><div><strong>Исправление ошибок</strong><span>Диагностика и устранение<br />проблем с драйверами</span></div></button><button class="quick-card grey" data-page="settings"><span class="quick-icon">▥</span><div><strong>Информация о системе</strong><span>Подробные сведения<br />об оборудовании и версии системы</span></div></button></div>
  ${state.demo ? '<div class="demo-banner"><span>●</span> Системные утилиты не обнаружены — интерфейс работает в демонстрационном режиме. Установите <b>pciutils</b> и <b>usbutils</b> для реального сканирования.</div>' : ''}
  <section class="section"><div class="section-title"><h2>Обнаруженные устройства</h2><button class="btn btn-primary" data-action="scan" ${state.scanning ? 'disabled' : ''}>↻ &nbsp; ${state.scanning ? 'Сканирование…' : 'Сканировать устройства'}</button></div><div class="device-table"><div class="table-head"><span>Устройство</span><span>Текущий драйвер</span><span>Статус</span><span>Действия</span></div>${state.scanning ? '<div class="loading-row"><span class="spinner"></span> Анализ оборудования…</div>' : state.devices.length ? state.devices.map(deviceRow).join('') : '<div class="empty-row">Устройства пока не сканировались</div>'}</div></section>
  <section class="repair-panel"><div class="repair-heading"><span class="repair-icon">⚙</span><div><h2>Исправление системных ошибок</h2><p>Автоматическое обнаружение и исправление проблем, связанных с драйверами и конфигурацией системы.</p></div></div><div class="repair-bottom"><div class="checks">${['Проверить конфигурацию системы', 'Сбросить настройки устройств', 'Очистить устаревшие драйверы', 'Исправить сломанные зависимости', 'Восстановить загрузку модулей', 'Применить рекомендации'].map((item, index) => `<label><input type="checkbox" ${index === 0 || index === 3 || index === 5 ? 'checked' : ''} /> <span>${item}</span></label>`).join('')}</div><button class="btn btn-purple repair-button" data-action="diagnose" ${state.diagnosticsRunning ? 'disabled' : ''}>⚒ &nbsp; ${state.diagnosticsRunning ? 'Выполняется диагностика…' : 'Проверить и исправить'}</button></div></section>`;
}

function renderDriverResults(devices) {
  if (!devices.length) {
    return '<div class="empty-state"><span>⌕</span><h3>Устройства не найдены</h3><p>Запустите сканирование или измените запрос.</p></div>';
  }
  return devices.map((device) => `<article class="driver-card"><div class="driver-card-icon icon-${escapeHtml(device.category || 'other')}">${escapeHtml(device.icon || '◈')}</div><div class="driver-card-main"><div class="card-label">${escapeHtml(device.source || 'Система')}</div><h3>${escapeHtml(device.name)}</h3><p>${escapeHtml(device.detail || 'Аппаратное устройство')}</p><div class="driver-meta"><span>Текущий: <b>${escapeHtml(device.driver || 'не определён')}</b></span><span class="compat ${device.status === 'problem' ? 'bad' : 'good'}">● ${device.status === 'problem' ? 'Требует проверки' : 'Совместимо'}</span></div></div><div class="driver-card-action">${device.recommendation ? `<b>${escapeHtml(device.recommendation.name)}</b><span>${escapeHtml(device.recommendation.reason)}</span><button class="btn btn-primary btn-small" data-install="${escapeHtml(device.recommendation.name)}" data-device="${escapeHtml(device.name)}">Подробнее и установить</button>` : '<span class="installed-mark">✓ Драйвер уже работает</span>'}</div></article>`).join('');
}

function searchPage() {
  const filtered = state.devices.filter((device) => `${device.name} ${device.category} ${device.driver || ''}`.toLowerCase().includes(state.query.toLowerCase()));
  return `<div class="page-title"><div><span class="eyebrow">КАТАЛОГ СОВМЕСТИМОСТИ</span><h1>Поиск драйверов</h1><p>Проверьте оборудование и найдите подходящие пакеты из репозиториев системы.</p></div><button class="btn btn-primary" data-action="scan" ${state.scanning ? 'disabled' : ''}>↻ &nbsp; ${state.scanning ? 'Сканирование…' : 'Обновить список'}</button></div><div class="search-bar"><span>⌕</span><input id="driver-search" value="${escapeHtml(state.query)}" placeholder="Поиск по устройству, производителю или драйверу…" /><span class="filter-pill">Все устройства⌄</span></div><div class="driver-results">${renderDriverResults(filtered)}</div>`;
}

function installPage() {
  const candidates = state.devices.filter((device) => device.recommendation);
  return `<div class="page-title"><div><span class="eyebrow">БЕЗОПАСНАЯ УСТАНОВКА</span><h1>Установка</h1><p>Каждая операция требует подтверждения и выполняется через Polkit.</p></div></div><div class="notice-card"><span class="notice-icon">✓</span><div><strong>Защищённый режим</strong><p>DriverHub не запускает произвольные команды и не удаляет работающий драйвер автоматически. Перед установкой будет показан план изменений.</p></div></div><div class="install-list">${candidates.length ? candidates.map((device) => `<div class="install-item"><div class="device-icon icon-${escapeHtml(device.category || 'other')}">${escapeHtml(device.icon || '◈')}</div><div><h3>${escapeHtml(device.name)}</h3><p>Рекомендуемый пакет: <b>${escapeHtml(device.recommendation.name)}</b></p></div><span class="install-status warning">Готово к установке</span><button class="btn btn-success btn-small" data-install="${escapeHtml(device.recommendation.name)}" data-device="${escapeHtml(device.name)}">Установить</button></div>`).join('') : '<div class="empty-state"><span>⇩</span><h3>Очередь пуста</h3><p>Совместимые рекомендации появятся после сканирования.</p></div>'}</div>`;
}

function repairPage() {
  const system = systemStatus();
  return `<div class="page-title"><div><span class="eyebrow">ДИАГНОСТИКА LINUX</span><h1>Исправление ошибок</h1><p>Локальные правила проверяют систему, а Qwen помогает объяснить результаты.</p></div><button class="btn btn-purple" data-action="diagnose" ${state.diagnosticsRunning ? 'disabled' : ''}>⚒ &nbsp; ${state.diagnosticsRunning ? 'Диагностика…' : 'Запустить диагностику'}</button></div><div class="diagnostic-status ${system.className}"><span class="big-status">${system.icon}</span><div><strong>${system.title}</strong><p>${system.text}</p></div><span class="diagnostic-time">Только безопасные проверки</span></div><div class="issues-list">${state.diagnosticsRunning ? '<div class="loading-row"><span class="spinner"></span> Выполняются диагностические проверки…</div>' : state.issues.length ? state.issues.map((issue) => `<article class="issue-card ${escapeHtml(issue.severity || 'warning')}"><span class="issue-marker">${issue.severity === 'success' ? '✓' : issue.severity === 'critical' ? '!' : '!'}</span><div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.description)}</p><span class="issue-action">Рекомендация: ${escapeHtml(issue.action)}</span></div><span class="risk">Риск: ${escapeHtml(issue.risk)}</span></article>`).join('') : '<div class="empty-state"><span>⚙</span><h3>Диагностика ещё не запускалась</h3><p>Нажмите «Запустить диагностику», чтобы проверить устройства и конфигурацию.</p></div>'}</div>${state.ai ? `<div class="ai-card"><div class="ai-title"><span>✦</span><div><strong>Анализ Qwen AI</strong><small>${state.ai.error ? 'Недоступен — показаны локальные правила' : 'Рекомендация на основе диагностических фактов'}</small></div></div><p>${escapeHtml(state.ai.error ? 'Подключение к Qwen не настроено или временно недоступно. Локальная диагностика продолжает работать.' : state.ai.summary || 'Анализ завершён.')}</p>${state.ai.recommendations?.length ? `<ul>${state.ai.recommendations.map((recommendation) => `<li>${escapeHtml(typeof recommendation === 'string' ? recommendation : recommendation.title || recommendation.reason)}</li>`).join('')}</ul>` : ''}</div>` : ''}`;
}

function logsPage() {
  return `<div class="page-title"><div><span class="eyebrow">АУДИТ ОПЕРАЦИЙ</span><h1>Журнал</h1><p>История сканирований, диагностики и подтверждённых установок.</p></div><button class="btn btn-secondary" data-action="clear-logs">Очистить журнал</button></div><div class="log-table"><div class="table-head"><span>Дата и время</span><span>Операция</span><span>Результат</span><span>Описание</span></div>${state.logs.length ? state.logs.map((log) => `<div class="log-row"><span>${new Date(log.timestamp).toLocaleString('ru-RU')}</span><b>${escapeHtml({ scan: 'Сканирование', diagnostics: 'Диагностика', install: 'Установка' }[log.type] || log.type)}</b><span class="log-status ${log.status}">${escapeHtml(log.status === 'success' ? 'Успешно' : log.status === 'error' ? 'Ошибка' : 'В процессе')}</span><span>${escapeHtml(log.summary || '')}</span></div>`).join('') : '<div class="empty-row">Журнал пока пуст</div>'}</div>`;
}

function settingsPage() {
  const info = state.system || {};
  return `<div class="page-title"><div><span class="eyebrow">КОНФИГУРАЦИЯ</span><h1>Настройки</h1><p>Параметры проверки системы и подключения AI-помощника.</p></div></div><div class="settings-grid"><section class="settings-card"><h2>Система</h2><div class="system-info"><span>Дистрибутив</span><b>${escapeHtml(info.distribution || 'Определяется…')}</b><span>Ядро Linux</span><b>${escapeHtml(info.kernel || '—')}</b><span>Архитектура</span><b>${escapeHtml(info.architecture || '—')}</b><span>Имя компьютера</span><b>${escapeHtml(info.hostname || '—')}</b></div></section><section class="settings-card"><h2>Поведение</h2><label class="setting-line"><span><b>Проверять при запуске</b><small>Автоматически сканировать устройства</small></span><input type="checkbox" class="toggle" data-setting="autoScan" ${state.settings?.autoScan !== false ? 'checked' : ''} /></label><label class="setting-line"><span><b>Уведомления</b><small>Показывать результаты операций</small></span><input type="checkbox" class="toggle" data-setting="notifications" ${state.settings?.notifications !== false ? 'checked' : ''} /></label><label class="setting-line"><span><b>Отправка диагностики в AI</b><small>Только после согласия пользователя</small></span><input type="checkbox" class="toggle" data-setting="sendDiagnostics" ${state.settings?.sendDiagnostics ? 'checked' : ''} /></label></section><section class="settings-card ai-settings"><h2>Qwen AI</h2><div class="ai-config-row"><span class="status-dot ${info.qwenConfigured ? 'success' : 'muted'}">${info.qwenConfigured ? '✓' : '!'}</span><div><b>${info.qwenConfigured ? 'Подключение настроено' : 'Ключ не настроен'}</b><small>${escapeHtml(info.qwenModel || 'qwen/qwen3.8-max:free')}</small></div></div><p>Ключ читается только из переменной окружения <code>QWEN_API_KEY</code> и не попадает в интерфейс или журнал. Для включения задайте ключ перед запуском приложения.</p><div class="code-note">QWEN_ENABLED=true<br />QWEN_BASE_URL=https://api.xkiro.com/v1</div></section></div>`;
}

function render() {
  renderNav();
  const pages = { home: homePage, search: searchPage, install: installPage, repair: repairPage, logs: logsPage, settings: settingsPage };
  el('#app').innerHTML = pages[state.page]();
  bindActions();
}

function toast(message, type = 'info') {
  const node = document.createElement('div'); node.className = `toast ${type}`; node.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span>${escapeHtml(message)}`; el('#toast-region').appendChild(node); setTimeout(() => node.remove(), 4300);
}

async function scan() {
  if (state.scanning) return;
  state.scanning = true; render();
  try { const result = await window.driverHub.devices.scan(); state.devices = result.devices; state.demo = result.demo; toast(result.note || `Обнаружено устройств: ${result.devices.length}`, result.demo ? 'info' : 'success'); } catch (error) { toast(error.message, 'error'); } finally { state.scanning = false; render(); }
}

async function diagnose() {
  if (state.diagnosticsRunning) return;
  state.diagnosticsRunning = true; toast('Выполняются безопасные проверки…'); render();
  try { const result = await window.driverHub.diagnostics.run({ useAI: state.settings?.sendDiagnostics === true }); state.devices = result.devices; state.issues = result.issues; state.system = result.info; state.ai = result.ai; state.demo = result.demo; state.page = state.page === 'home' ? 'home' : 'repair'; toast('Диагностика завершена', 'success'); } catch (error) { toast(error.message, 'error'); } finally { state.diagnosticsRunning = false; render(); }
}

function showInstall(packageName, deviceName) {
  if (!packageName) { toast('Для этого устройства безопасный пакет пока не найден', 'info'); return; }
  el('#modal-root').innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal"><button class="modal-close" data-close-modal>×</button><span class="modal-symbol">⇩</span><h2>Установить драйвер?</h2><p>Для устройства <b>${escapeHtml(deviceName)}</b> будет установлен пакет:</p><div class="package-preview"><code>${escapeHtml(packageName)}</code><span>через системный пакетный менеджер APT</span></div><div class="modal-warning">Потребуются права администратора. Перед изменением системы Polkit покажет запрос подтверждения. Перезагрузка может потребоваться после установки.</div><div class="modal-actions"><button class="btn btn-secondary" data-close-modal>Отмена</button><button class="btn btn-success" data-confirm-install="${escapeHtml(packageName)}">Подтвердить установку</button></div></div></div>`;
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  el('#modal-backdrop')?.addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  el('[data-confirm-install]').addEventListener('click', async () => { closeModal(); toast('Запрос прав администратора…'); try { const result = await window.driverHub.drivers.install({ packageName }); toast(result.rebootRequired ? 'Драйвер установлен. Рекомендуется перезагрузка.' : 'Драйвер успешно установлен.', 'success'); state.logs = await window.driverHub.logs.list(); render(); } catch (error) { toast(error.message, 'error'); } });
}

function closeModal() { el('#modal-root').innerHTML = ''; }
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function bindActions() {
  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => { state.page = button.dataset.page; render(); }));
  document.querySelectorAll('[data-window]').forEach((button) => button.addEventListener('click', () => window.driverHub.window[button.dataset.window === 'maximize' ? 'toggleMaximize' : button.dataset.window]()));
  document.querySelectorAll('[data-action="scan"]').forEach((button) => button.addEventListener('click', scan));
  document.querySelectorAll('[data-action="diagnose"]').forEach((button) => button.addEventListener('click', diagnose));
  document.querySelectorAll('[data-install]').forEach((button) => button.addEventListener('click', () => showInstall(button.dataset.install, button.dataset.device)));
  document.querySelectorAll('[data-reinstall]').forEach((button) => button.addEventListener('click', () => toast('Переустановка появится после проверки доступности пакета.', 'info')));
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
  el('[data-action="clear-logs"]')?.addEventListener('click', async () => { await window.driverHub.logs.clear(); state.logs = []; render(); toast('Журнал очищен', 'success'); });
}

async function init() {
  try {
    const [systemRes, settingsRes, logsRes] = await Promise.allSettled([
      window.driverHub?.system?.info?.(),
      window.driverHub?.settings?.get?.(),
      window.driverHub?.logs?.list?.()
    ]);
    if (systemRes.status === 'fulfilled' && systemRes.value) {
      state.system = systemRes.value;
    }
    if (settingsRes.status === 'fulfilled' && settingsRes.value) {
      state.settings = { ...DEFAULT_CLIENT_SETTINGS, ...settingsRes.value };
    }
    if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) {
      state.logs = logsRes.value;
    }
  } catch (error) {
    toast(error.message, 'error');
  }
  render();
  if (state.settings?.autoScan !== false) scan();
}

init();
